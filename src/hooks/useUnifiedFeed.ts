import { useState, useEffect, useCallback, useRef } from "react";
import type { UnifiedPost, FeedAdapter } from "../adapters/types";
import { NostrAdapter } from "../adapters/nostr";
import { MastodonAdapter } from "../adapters/mastodon";
import { RSSAdapter } from "../adapters/rss";
import { RedditAdapter } from "../adapters/reddit";
import { LemmyAdapter } from "../adapters/lemmy";
import { PixelfedAdapter } from "../adapters/pixelfed";
import { ImgurAdapter } from "../adapters/imgur";
import { PieFedAdapter } from "../adapters/piefed";
import { MisskeyAdapter } from "../adapters/misskey";
import { BlueskyAdapter } from "../adapters/bluesky";
import { ThreadsAdapter } from "../adapters/threads";
import { NostrPhotosAdapter, NostrVideosAdapter } from "../adapters/nostrMedia";
import { sanitizeHTML } from "../lib/sanitize";
import { polycentricManager } from "../lib/polycentric/manager";
import { loadSyncedJSON, STORAGE_KEYS } from "../lib/sync";

// ── Category system ─────────────────────────────────────────────

export type FeedCategory = 'text' | 'media' | 'all';

export interface CategoryDef {
    label: string;
    value: FeedCategory;
    description: string;
    icon: string; // emoji
}

export const FEED_CATEGORIES: CategoryDef[] = [
    { label: 'Text', value: 'text', description: 'Text-only posts from all networks', icon: '📝' },
    { label: 'Media', value: 'media', description: 'Posts with images or video', icon: '🖼️' },
];

// Map category → adapter names (lowercase match)
const CATEGORY_MAP: Record<Exclude<FeedCategory, 'all'>, string[]> = {
    // Text: All social networks + RSS
    text: ['mastodon', 'nostr', 'bluesky', 'misskey', 'threads', 'reddit', 'lemmy', 'rss'],

    // Media: All social networks + dedicated media sources
    media: ['pixelfed', 'imgur', 'piefed', 'nostr photos', 'nostr videos', 'mastodon', 'bluesky', 'threads', 'reddit', 'lemmy', 'misskey'],
};

// ── Default adapters ────────────────────────────────────────────

function createDefaultAdapters(): FeedAdapter[] {
    return [
        // Social
        new MastodonAdapter("https://mastodon.social"),
        new NostrAdapter(),
        new BlueskyAdapter(),
        new MisskeyAdapter(),
        new ThreadsAdapter("trending"),
        // Photos
        new PixelfedAdapter(),
        new ImgurAdapter(),
        new PieFedAdapter(),
        new NostrPhotosAdapter(),
        // Videos
        new NostrVideosAdapter(),
        // Links
        new RedditAdapter("popular"),
        new LemmyAdapter("https://lemmy.world"),
        new RSSAdapter("https://hnrss.org/frontpage"),
        new RSSAdapter("https://lobste.rs/rss"),
        new RSSAdapter("https://lifehacker.com/rss"),
        new RSSAdapter("https://makezine.com/feed/"),
    ];
}

const defaultAdapters = createDefaultAdapters();

// ── Timeout helper ──────────────────────────────────────────────

const ADAPTER_TIMEOUT_MS = 20000;

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
            console.warn(`[Feed] ${label} timed out after ${ms}ms`);
            reject(new Error(`${label} timed out`));
        }, ms);
        promise.then(
            (val) => { clearTimeout(timer); resolve(val); },
            (err) => { clearTimeout(timer); reject(err); },
        );
    });
}

// ── Hook ────────────────────────────────────────────────────────

interface UseUnifiedFeedOptions {
    topic?: string;
    category?: FeedCategory;
    sourceFilter?: string;      // filter to a single adapter by name (e.g. 'mastodon')
    customRSSFeeds?: string[];
}

const PAGE_SIZE = 20;

export function useUnifiedFeed(options: UseUnifiedFeedOptions = {}) {
    const { topic, category = 'text', sourceFilter, customRSSFeeds } = options;
    const [allPosts, setAllPosts] = useState<UnifiedPost[]>([]);
    const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const fetchIdRef = useRef(0);

    const [storedRSSFeeds, setStoredRSSFeeds] = useState<string[]>(() => {
        const identity = polycentricManager.systemKey || 'anonymous';
        return loadSyncedJSON<string[]>(STORAGE_KEYS.customRss, identity, []);
    });

    useEffect(() => {
        const onSync = (e: any) => {
            if (e?.detail?.baseKey !== STORAGE_KEYS.customRss) return;
            const identity = polycentricManager.systemKey || 'anonymous';
            if (e?.detail?.identity !== identity) return;
            setStoredRSSFeeds(loadSyncedJSON<string[]>(STORAGE_KEYS.customRss, identity, []));
        };
        window.addEventListener('social-portal-sync', onSync);
        return () => window.removeEventListener('social-portal-sync', onSync);
    }, []);

    const effectiveRSSFeeds = customRSSFeeds ?? storedRSSFeeds;
    const rssKey = effectiveRSSFeeds.join(',');

    const fetchAll = useCallback(async (options: { forceRefresh?: boolean } = {}) => {
        const currentFetchId = ++fetchIdRef.current;
        const { forceRefresh } = options;

        setAllPosts([]);
        setVisibleCount(PAGE_SIZE);
        setLoading(true);
        setError(null);

        try {
            let adapters: FeedAdapter[] = [...defaultAdapters];

            if (effectiveRSSFeeds?.length) {
                adapters.push(...effectiveRSSFeeds.map(url => new RSSAdapter(url)));
            }

            // Filter by specific source (for network directory)
            if (sourceFilter) {
                adapters = adapters.filter(a =>
                    a.name.toLowerCase() === sourceFilter.toLowerCase()
                );
            }
            // Filter by category
            else if (category !== 'all') {
                const allowedNames = (CATEGORY_MAP as any)[category] || CATEGORY_MAP['text'];
                adapters = adapters.filter(a =>
                    allowedNames.some((n: string) => a.name.toLowerCase().includes(n))
                );

                // Intentionally no “secret” heavy-media sources (e.g. Invidious/YouTube).
            }

            console.log(`[UnifiedFeed] Category: ${category}, Selected Adapters:`, adapters.map(a => a.name));

            // Stream results: as each adapter resolves, merge into the post list
            const accumulated: UnifiedPost[] = [];
            let successCount = 0;

            const promises = adapters.map(a =>
                withTimeout(
                    a.fetchPosts(topic, { forceRefresh, category }),
                    ADAPTER_TIMEOUT_MS,
                    a.name,
                )
                    .then(posts => {
                        if (currentFetchId !== fetchIdRef.current) return;
                        successCount++;

                        let sanitized = posts.map(p => ({
                            ...p,
                            content: sanitizeHTML(p.content),
                        }));

                        // CENTRALIZED FILTERING
                        if (category === 'text') {
                            sanitized = sanitized.filter(p => !p.media || p.media.length === 0);
                        } else if (category === 'media') {
                            sanitized = sanitized.filter(p => p.media && p.media.length > 0);
                        }

                        accumulated.push(...sanitized);
                        // Sort and set — each adapter arriving updates the feed
                        const sorted = [...accumulated].sort((a, b) => b.timestamp - a.timestamp);
                        setAllPosts(sorted);
                    })
                    .catch(e => {
                        console.error(`Adapter ${a.name} failed:`, e);
                    })
            );

            await Promise.all(promises);

            if (currentFetchId === fetchIdRef.current) {
                if (successCount === 0 && adapters.length > 0) {
                    setError("All feeds failed to connect. Try again.");
                } else if (accumulated.length === 0) {
                    // No error, just empty
                    setError(null);
                }
            }

        } catch (e) {
            if (currentFetchId === fetchIdRef.current) {
                setError("Failed to fetch feeds");
            }
        } finally {
            if (currentFetchId === fetchIdRef.current) {
                setLoading(false);
            }
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [topic, category, sourceFilter, rssKey]);

    useEffect(() => {
        fetchAll(); // Initial load (cached)
    }, [fetchAll]);

    const refetch = useCallback(() => {
        fetchAll({ forceRefresh: true }); // Manual refresh (bust cache)
    }, [fetchAll]);

    const loadMore = useCallback(() => {
        setVisibleCount(prev => prev + PAGE_SIZE);
    }, []);

    const visiblePosts = allPosts.slice(0, visibleCount);
    const hasMore = visibleCount < allPosts.length;

    return { posts: visiblePosts, allCount: allPosts.length, hasMore, loadMore, loading, error, refetch };
}
