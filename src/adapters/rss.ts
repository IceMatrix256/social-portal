import type { FeedAdapter, UnifiedPost } from "./types";
import { fetchProxyContent } from "../lib/proxy";

/**
 * Generic RSS adapter for any standard feed.
 */
export class RSSAdapter implements FeedAdapter {
    name = "RSS";
    description = "Standard web feed";
    private feedUrl: string;

    constructor(feedUrl: string) {
        this.feedUrl = feedUrl;
    }

    async fetchPosts(_topic?: string): Promise<UnifiedPost[]> {
        try {
            const rawContent = await fetchProxyContent(this.feedUrl);
            const parser = new DOMParser();
            const xml = parser.parseFromString(rawContent, "text/xml");

            const items = Array.from(xml.querySelectorAll("item"));

            return items.slice(0, 40).map((item) => {
                const title = item.querySelector("title")?.textContent || "No Title";
                const link = item.querySelector("link")?.textContent || "";
                const pubDate = item.querySelector("pubDate")?.textContent || "";
                const description = item.querySelector("description")?.textContent || "";
                const guid = item.querySelector("guid")?.textContent || link;

                // Extract image from enclosure or description
                const enclosure = item.querySelector("enclosure");
                const media: { type: 'image' | 'video'; url: string; previewUrl?: string }[] = [];

                if (enclosure && enclosure.getAttribute("type")?.startsWith("image")) {
                    media.push({
                        type: 'image',
                        url: enclosure.getAttribute("url") || "",
                        previewUrl: enclosure.getAttribute("url") || "",
                    });
                } else {
                    const imgMatch = description.match(/src="([^"]+\.(jpg|jpeg|png|gif|webp)[^"]*)"/i);
                    if (imgMatch) {
                        media.push({
                            type: 'image',
                            url: imgMatch[1],
                            previewUrl: imgMatch[1],
                        });
                    }
                }

                // Clean description: strip HTML tags and truncate
                const cleanDesc = description
                    .replace(/<[^>]+>/g, ' ')
                    .replace(/\s+/g, ' ')
                    .trim()
                    .substring(0, 280);
                
                const feedHost = (() => {
                    try { return new URL(link).hostname; } catch { return new URL(this.feedUrl).hostname; }
                })();
                const feedOrigin = (() => {
                    try { return new URL(link).origin; } catch { return new URL(this.feedUrl).origin; }
                })();

                return {
                    id: `rss-${guid}`,
                    source: 'rss' as const,
                    author: {
                        name: feedHost,
                        handle: "rss",
                        avatar: `https://api.dicebear.com/7.x/initials/svg?seed=${feedHost}`,
                        url: feedOrigin,
                    },
                    content: `<strong>${title}</strong>${cleanDesc ? `<p class="mt-1 text-zinc-400">${cleanDesc}</p>` : ''}`,
                    media,
                    url: link,
                    timestamp: pubDate ? new Date(pubDate).getTime() : Date.now(),
                    originalData: { title, link, description },
                };
            });
        } catch (e) {
            console.error("RSS fetch error:", e);
            return [];
        }
    }
}
