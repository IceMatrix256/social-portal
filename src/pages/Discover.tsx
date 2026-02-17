/**
 * Discover — Mixed Feed
 *
 * The "mish-mash" view: aggregates content from ALL networks,
 * filterable by category pills (All, Social, Photos, Videos, Links).
 * Also supports custom RSS feeds and topic browsing.
 */

import { useState, useEffect } from "react";
import { useUnifiedFeed, FEED_CATEGORIES } from "../hooks/useUnifiedFeed";
import type { FeedCategory } from "../hooks/useUnifiedFeed";
import { PostCard } from "../components/PostCard";
import {
    Loader2, RefreshCw, Filter, Rss, Plus, X, Hash,
    Cpu, Bitcoin, Gamepad2, Newspaper, Monitor, BookOpen,
    Camera, TrendingUp
} from "lucide-react";
import { LoadMoreTrigger } from "../components/LoadMoreTrigger";
import { ErrorRetry } from "../components/ErrorRetry";
import { polycentricManager } from "../lib/polycentric/manager";
import { loadSyncedJSON, saveSyncedJSON, migrateLegacyKey, STORAGE_KEYS, getScopedStorageKey } from "../lib/sync";

// ── Topic Management ──────────────────────────────────────────────

interface Topic {
    label: string;
    tag: string;
    icon?: any; // lucide icon component
    isDefault?: boolean;
}

const DEFAULT_TOPICS: Topic[] = [
    { label: 'Technology', tag: 'technology', icon: Cpu, isDefault: true },
    { label: 'Crypto', tag: 'crypto', icon: Bitcoin, isDefault: true },
    { label: 'Gaming', tag: 'gaming', icon: Gamepad2, isDefault: true },
    { label: 'News', tag: 'news', icon: Newspaper, isDefault: true },
    { label: 'Programming', tag: 'programming', icon: Monitor, isDefault: true },
    { label: 'Science', tag: 'science', icon: BookOpen, isDefault: true },
    { label: 'Photography', tag: 'photography', icon: Camera, isDefault: true },
    { label: 'Trending', tag: '', icon: TrendingUp, isDefault: true },
];

type StoredTopic = Pick<Topic, 'label' | 'tag' | 'isDefault'>;

function getStoredTopics(identity: string | null | undefined): Topic[] {
    try {
        migrateLegacyKey(STORAGE_KEYS.topics, getScopedStorageKey(STORAGE_KEYS.topics, identity));
        const parsed = loadSyncedJSON<StoredTopic[] | null>(STORAGE_KEYS.topics, identity, null);
        if (parsed !== null) {
            // Re-map icons for default topics, use Hash for others
            return parsed.map((t: any) => ({
                ...t,
                icon: DEFAULT_TOPICS.find(dt => dt.tag === t.tag)?.icon || Hash
            }));
        }
    } catch (e) { console.error("Failed to load topics", e); }
    return DEFAULT_TOPICS;
}

// ── Add RSS Feed Form ─────────────────────────────────────────────

function AddRSSForm({ onAdd }: { onAdd: (url: string) => void }) {
    const [url, setUrl] = useState("");

    return (
        <div className="flex gap-2">
            <input
                type="url"
                placeholder="https://example.com/feed.xml"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                className="flex-1 bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-900 dark:text-white focus:outline-none focus:border-indigo-500 transition-colors"
                onKeyDown={(e) => {
                    if (e.key === 'Enter' && url.trim()) {
                        onAdd(url.trim());
                        setUrl("");
                    }
                }}
            />
            <button
                onClick={() => {
                    if (url.trim()) { onAdd(url.trim()); setUrl(""); }
                }}
                className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
            >
                Add
            </button>
        </div>
    );
}

// ── Main Discover Page ────────────────────────────────────────────

import { Pencil, Trash2, Check } from "lucide-react";

export function Discover() {
    const [activeCategory, setActiveCategory] = useState<FeedCategory>('text');
    const [activeTopic, setActiveTopic] = useState<string | null>(null);
    const [isEditing, setIsEditing] = useState(false);

    // Topics State
    const [topics, setTopics] = useState<Topic[]>(() => getStoredTopics(polycentricManager.systemKey));
    const [newTopic, setNewTopic] = useState("");

    // RSS State
    const [customFeeds, setCustomFeeds] = useState<string[]>(() => {
        migrateLegacyKey(STORAGE_KEYS.customRss, getScopedStorageKey(STORAGE_KEYS.customRss, polycentricManager.systemKey));
        return loadSyncedJSON<string[]>(STORAGE_KEYS.customRss, polycentricManager.systemKey, []);
    });
    
    useEffect(() => {
        const onSync = (e: any) => {
            const id = polycentricManager.systemKey || 'anonymous';
            if (e?.detail?.identity !== id) return;
            if (e?.detail?.baseKey === STORAGE_KEYS.customRss) {
                setCustomFeeds(loadSyncedJSON<string[]>(STORAGE_KEYS.customRss, polycentricManager.systemKey, []));
            }
            if (e?.detail?.baseKey === STORAGE_KEYS.topics) {
                setTopics(getStoredTopics(polycentricManager.systemKey));
            }
        };
        window.addEventListener('social-portal-sync', onSync);
        return () => window.removeEventListener('social-portal-sync', onSync);
    }, []);

    const { posts, allCount, hasMore, loadMore, loading, error, refetch } = useUnifiedFeed({
        category: activeCategory,
        topic: activeTopic || undefined,
        customRSSFeeds: customFeeds,
    });

    // ── Topic Handlers ──
    const addTopic = () => {
        if (!newTopic.trim()) return;
        const tag = newTopic.trim().toLowerCase();
        // Prevent duplicates
        if (topics.some(t => t.tag === tag)) {
            setNewTopic("");
            return;
        }

        const added: Topic = { label: newTopic.trim(), tag, icon: Hash };
        const updated = [...topics, added];
        setTopics(updated);
        saveSyncedJSON(
            STORAGE_KEYS.topics,
            polycentricManager.systemKey,
            updated.map((t) => ({ label: t.label, tag: t.tag, isDefault: t.isDefault }))
        );
        setNewTopic("");
    };

    const removeTopic = (tag: string) => {
        const updated = topics.filter(t => t.tag !== tag);
        setTopics(updated);
        saveSyncedJSON(
            STORAGE_KEYS.topics,
            polycentricManager.systemKey,
            updated.map((t) => ({ label: t.label, tag: t.tag, isDefault: t.isDefault }))
        );
        if (activeTopic === tag) setActiveTopic(null);
    };

    // ── RSS Handlers ──
    const addCustomFeed = (url: string) => {
        const updated = [...customFeeds, url];
        setCustomFeeds(updated);
        saveSyncedJSON(STORAGE_KEYS.customRss, polycentricManager.systemKey, updated);
    };

    const removeCustomFeed = (url: string) => {
        const updated = customFeeds.filter(f => f !== url);
        setCustomFeeds(updated);
        saveSyncedJSON(STORAGE_KEYS.customRss, polycentricManager.systemKey, updated);
    };

    return (
        <div>
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h1 className="text-3xl font-bold text-zinc-900 dark:text-zinc-100">
                        Discover
                    </h1>
                    <p className="text-zinc-500 mt-1">Mixed feed from all networks — explore everything in one view</p>
                </div>
                <div className="flex gap-2">
                    <button
                        onClick={() => setIsEditing(!isEditing)}
                        className={`p-2.5 rounded-xl transition-all border ${isEditing
                            ? 'bg-amber-500/20 text-amber-500 border-amber-500/50'
                            : 'bg-zinc-100 dark:bg-zinc-800/80 text-zinc-500 dark:text-zinc-400 border-zinc-200 dark:border-zinc-700/50 hover:bg-zinc-200 dark:hover:bg-zinc-700'
                            }`}
                        title={isEditing ? "Done editing" : "Edit topics & feeds"}
                    >
                        {isEditing ? <Check className="w-5 h-5" /> : <Pencil className="w-5 h-5" />}
                    </button>
                    <button
                        onClick={refetch}
                        className="bg-zinc-100 dark:bg-zinc-800/80 hover:bg-zinc-200 dark:hover:bg-zinc-700 p-2.5 rounded-xl transition-all border border-zinc-200 dark:border-zinc-700/50 hover:border-zinc-300 dark:hover:border-zinc-600 active:scale-95"
                        title="Refresh feed"
                    >
                        <RefreshCw className={`w-5 h-5 text-zinc-400 ${loading ? 'animate-spin' : ''}`} />
                    </button>
                </div>
            </div>

            {/* Category filter pills */}
            <div className="flex gap-2 mb-6 flex-wrap">
                <Filter className="w-4 h-4 text-zinc-500 mt-2" />
                {FEED_CATEGORIES.map(cat => (
                    <button
                        key={cat.value}
                        onClick={() => { setActiveCategory(cat.value); setActiveTopic(null); }}
                        title={cat.description}
                        className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all flex items-center gap-1.5 ${activeCategory === cat.value && !activeTopic
                            ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/25'
                            : 'bg-zinc-100 dark:bg-zinc-800/60 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700/60 hover:text-zinc-800 dark:hover:text-zinc-300 border border-zinc-200 dark:border-zinc-700/40'
                            }`}
                    >
                        <span>{cat.icon}</span>
                        <span>{cat.label}</span>
                    </button>
                ))}
            </div>

            {/* Topic Pills */}
            <div className="mb-6">
                <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                        <Hash className="w-4 h-4 text-zinc-600" />
                        <span className="text-sm text-zinc-500">Browse by topic</span>
                    </div>
                </div>

                <div className="flex flex-wrap gap-2 items-center">
                    {topics.map(t => {
                        const isActive = activeTopic === t.tag;
                        return (
                            <div key={t.tag} className="relative group">
                                <button
                                    onClick={() => {
                                        if (isEditing) return;
                                        setActiveTopic(isActive ? null : t.tag);
                                        // if (!isActive) setActiveCategory('all'); // Removed strict override, let user keep current mode
                                    }}
                                    disabled={isEditing}
                                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all ${isActive
                                        ? 'bg-purple-600 text-white shadow-lg shadow-purple-500/25'
                                        : isEditing
                                            ? 'bg-zinc-100 dark:bg-zinc-800/40 text-zinc-400 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-800/60 cursor-default opacity-60'
                                            : 'bg-zinc-100 dark:bg-zinc-800/40 text-zinc-600 dark:text-zinc-500 hover:bg-zinc-200 dark:hover:bg-zinc-700/40 hover:text-zinc-800 dark:hover:text-zinc-400 border border-zinc-200 dark:border-zinc-800/60'
                                        }`}
                                >
                                    <t.icon className="w-3 h-3" />
                                    {t.label}
                                </button>
                                {isEditing && (
                                    <button
                                        onClick={() => removeTopic(t.tag)}
                                        className="absolute -top-1.5 -right-1.5 bg-red-500 text-white rounded-full p-0.5 shadow-sm hover:bg-red-600 transition-colors"
                                    >
                                        <X className="w-3 h-3" />
                                    </button>
                                )}
                            </div>
                        );
                    })}

                    {/* Add Topic Input */}
                    {isEditing && (
                        <div className="flex items-center gap-2 animate-in fade-in slide-in-from-left-2 direction-normal duration-300">
                            <div className="relative">
                                <Hash className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-zinc-500" />
                                <input
                                    type="text"
                                    value={newTopic}
                                    onChange={(e) => setNewTopic(e.target.value)}
                                    placeholder="Add topic..."
                                    className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-full pl-8 pr-3 py-1.5 text-xs text-zinc-900 dark:text-white focus:outline-none focus:border-indigo-500 w-32"
                                    onKeyDown={(e) => e.key === 'Enter' && addTopic()}
                                />
                            </div>
                            <button
                                onClick={addTopic}
                                disabled={!newTopic.trim()}
                                className="bg-zinc-800 text-zinc-400 hover:text-indigo-400 p-1.5 rounded-full border border-zinc-700 disabled:opacity-50"
                            >
                                <Plus className="w-3 h-3" />
                            </button>
                        </div>
                    )}
                </div>
            </div>

            {/* Custom RSS Feeds */}
            <div className="mb-8">
                <details className="group" open={customFeeds.length > 0 || isEditing}>
                    <summary className="flex items-center gap-2 text-sm font-medium text-zinc-600 dark:text-zinc-400 cursor-pointer hover:text-zinc-800 dark:hover:text-zinc-300 transition-colors mb-3 select-none">
                        <Rss className="w-4 h-4 text-amber-500" />
                        Custom RSS Feeds
                        {customFeeds.length > 0 && (
                            <span className="text-xs bg-zinc-800 text-zinc-500 px-2 py-0.5 rounded-full">{customFeeds.length}</span>
                        )}
                    </summary>
                    <div className="mt-2 pl-2 border-l-2 border-zinc-800/50 ml-1.5">
                        {customFeeds.length > 0 ? (
                            <div className="space-y-2 mb-3">
                                {customFeeds.map(url => (
                                    <div key={url} className="flex items-center gap-2 p-3 bg-zinc-50 dark:bg-zinc-900/60 rounded-xl border border-zinc-200 dark:border-zinc-800/50 group/item">
                                        <Rss className="w-4 h-4 text-amber-500 shrink-0" />
                                        <span className="text-sm text-zinc-700 dark:text-zinc-300 truncate flex-1">{url}</span>
                                        <button
                                            onClick={() => removeCustomFeed(url)}
                                            className={`text-zinc-500 hover:text-red-400 transition-colors ${isEditing ? 'opacity-100' : 'opacity-0 group-hover/item:opacity-100'}`}
                                            title="Remove feed"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            !isEditing && <p className="text-xs text-zinc-600 mb-3 italic">No custom feeds added yet.</p>
                        )}

                        {(isEditing || customFeeds.length === 0) && (
                            <AddRSSForm onAdd={addCustomFeed} />
                        )}
                    </div>
                </details>
            </div>

            {/* Feed */}
            {loading && (
                <div className="flex flex-col items-center justify-center py-24 gap-3">
                    <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
                    <p className="text-zinc-500 text-sm">Fetching from networks…</p>
                </div>
            )}
            {error && (
                <ErrorRetry message={error} onRetry={refetch} loading={loading} />
            )}

            {!loading && !error && posts.length === 0 && (
                <div className="text-center py-24">
                    <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-zinc-100 dark:bg-zinc-800/60 flex items-center justify-center">
                        <Filter className="w-8 h-8 text-zinc-400 dark:text-zinc-500" />
                    </div>
                    <p className="text-zinc-600 dark:text-zinc-500">No posts found.</p>
                    <p className="text-zinc-500 dark:text-zinc-600 text-sm mt-1">Try a different filter or check your network connections.</p>
                </div>
            )}

            <div className="max-w-2xl mx-auto">
                {posts.map(post => (
                    <PostCard key={`${post.source}-${post.id}`} post={post} />
                ))}
                <LoadMoreTrigger
                    hasMore={hasMore}
                    loading={loading}
                    loadMore={loadMore}
                    totalCount={allCount}
                    visibleCount={posts.length}
                />
            </div>
        </div>
    );
}
