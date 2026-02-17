import type { FeedAdapter, UnifiedPost } from "./types";
import { fetchWithInstanceFallback, REDLIB_INSTANCES } from "../lib/instances";

function isValidRedlibListing(content: string): boolean {
    if (!content || content.toLowerCase().includes("<html")) {
        return false;
    }
    try {
        const parsed = JSON.parse(content);
        return parsed?.kind === "Listing" && Array.isArray(parsed?.data?.children);
    } catch {
        return false;
    }
}

async function fetchFromRedlibBridge(path: string): Promise<string> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 12000);
    try {
        const response = await fetch(`/api/redlib${path}`, {
            signal: controller.signal,
            headers: {
                "Accept": "application/json, text/plain, */*"
            }
        });
        if (!response.ok) {
            throw new Error(`Bridge HTTP ${response.status}`);
        }
        const text = await response.text();
        if (!isValidRedlibListing(text)) {
            throw new Error("Bridge payload failed Listing validation");
        }
        return text;
    } finally {
        clearTimeout(timeoutId);
    }
}

export class RedditAdapter implements FeedAdapter {
    name = "Reddit";
    description = "Front page of the internet (via Redlib)";
    private subreddit: string;

    constructor(subreddit: string = "popular") {
        this.subreddit = subreddit;
    }

    async fetchPosts(topic?: string, options?: { forceRefresh?: boolean, category?: 'text' | 'media' | 'all' }): Promise<UnifiedPost[]> {
        const sub = topic || this.subreddit;

        let path = `/r/${sub}.json?limit=40&raw_json=1`;
        if (options?.forceRefresh) {
            path += `&_t=${Date.now()}`;
        }

        try {
            const rawContent = await fetchFromRedlibBridge(path).catch(async (bridgeError) => {
                console.warn("Redlib bridge failed, falling back to instance rotation:", bridgeError);
                return fetchWithInstanceFallback(path, REDLIB_INSTANCES, {
                    ...options,
                    headers: { "User-Agent": "SocialPortal/1.0" },
                    validate: isValidRedlibListing
                });
            });
            const data = JSON.parse(rawContent);

            if (!data?.data?.children) {
                console.warn("Reddit: unexpected response shape");
                return [];
            }

            const posts = data.data.children
                .filter((child: any) => child.kind === "t3")
                .slice(0, 40)
                .map((child: any) => {
                    const post = child.data;
                    const hasImage = post.url_overridden_by_dest &&
                        /\.(jpg|jpeg|png|gif|webp)$/i.test(post.url_overridden_by_dest);
                    const thumbnail = post.thumbnail && post.thumbnail !== 'self' &&
                        post.thumbnail !== 'default' && post.thumbnail !== 'nsfw'
                        ? post.thumbnail : "";

                    const media: { type: 'image' | 'video'; url: string; previewUrl?: string }[] = [];

                    // Try Reddit's preview object first — it has proper resolutions
                    const preview = post.preview?.images?.[0];
                    if (preview) {
                        const sourceUrl = preview.source?.url?.replace(/&amp;/g, '&');
                        // Pick a mid-tier resolution for previewUrl (around 640px wide)
                        const resolutions = preview.resolutions || [];
                        const midRes = resolutions.find((r: any) => r.width >= 640) || resolutions[resolutions.length - 1];
                        const midUrl = midRes?.url?.replace(/&amp;/g, '&');

                        if (sourceUrl) {
                            media.push({
                                type: 'image',
                                url: sourceUrl,
                                previewUrl: midUrl || sourceUrl,
                            });
                        }
                    }
                    // Direct image URL (i.redd.it, imgur, etc.)
                    else if (hasImage) {
                        media.push({
                            type: 'image',
                            url: post.url_overridden_by_dest,
                        });
                    }
                    // Reddit-hosted video
                    else if (post.is_video && post.media?.reddit_video?.fallback_url) {
                        media.push({
                            type: 'video',
                            url: post.media.reddit_video.fallback_url,
                            previewUrl: thumbnail || undefined,
                        });
                    }
                    // Gallery posts (multiple images)
                    else if (post.is_gallery && post.media_metadata) {
                        Object.values(post.media_metadata).slice(0, 4).forEach((item: any) => {
                            if (item.status === 'valid' && item.s?.u) {
                                media.push({
                                    type: 'image',
                                    url: item.s.u.replace(/&amp;/g, '&'),
                                    previewUrl: item.p?.[item.p.length - 1]?.u?.replace(/&amp;/g, '&'),
                                });
                            }
                        });
                    }

                    const selftext = post.selftext
                        ? `<p>${post.selftext.substring(0, 300)}${post.selftext.length > 300 ? '…' : ''}</p>`
                        : '';

                    return {
                        id: post.id,
                        source: 'reddit' as const,
                        author: {
                            name: post.author || "deleted",
                            handle: `u/${post.author} · r/${post.subreddit}`,
                            avatar: `https://api.dicebear.com/7.x/identicon/svg?seed=${post.author || post.subreddit}`,
                            url: `https://www.reddit.com/u/${post.author}`,
                        },
                        content: `<strong>${post.title}</strong>${selftext}`,
                        media,
                        url: `https://www.reddit.com${post.permalink}`,
                        timestamp: (post.created_utc || 0) * 1000,
                        originalData: post,
                    };
                });
            // Filter based on category
            // (Handled by useUnifiedFeed hook now)

            return posts;
        } catch (e) {
            console.error("Reddit fetch error:", e);
            throw e;
        }
    }
}
