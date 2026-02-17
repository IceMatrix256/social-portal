import { useState } from 'react';
import { useBookmarkList } from '../hooks/useBookmarks';
import type { FeedCategory } from '../hooks/useUnifiedFeed';

import {
    Bookmark, Download, Share2, Trash2, ExternalLink, FolderOpen
} from 'lucide-react';

// ── Source badge colors (same as Dashboard) ─────────────────

const SOURCE_COLORS: Record<string, string> = {
    mastodon: 'bg-indigo-500/20 text-indigo-400',
    nostr: 'bg-purple-500/20 text-purple-400',
    reddit: 'bg-orange-500/20 text-orange-400',
    lemmy: 'bg-teal-500/20 text-teal-400',
    pixelfed: 'bg-pink-500/20 text-pink-400',
    imgur: 'bg-emerald-500/20 text-emerald-400',
    piefed: 'bg-lime-500/20 text-lime-400',
    rss: 'bg-amber-500/20 text-amber-400',
    bluesky: 'bg-sky-500/20 text-sky-400',
    peertube: 'bg-red-500/20 text-red-400',
    polycentric: 'bg-cyan-500/20 text-cyan-400',
    threads: 'bg-slate-500/20 text-slate-300',
};

// ── Saved Page ──────────────────────────────────────────────

export function Saved() {
    const [activeCategory, setActiveCategory] = useState<FeedCategory | 'all'>('all');
    const { bookmarks, count, remove, exportBookmarks } = useBookmarkList(activeCategory);

    const handleShare = async (url: string) => {
        try {
            if (navigator.share) {
                await navigator.share({ url });
            } else {
                await navigator.clipboard.writeText(url);
            }
        } catch { /* cancelled */ }
    };

    return (
        <div>
            {/* Header */}
            <div className="flex items-center justify-between mb-8">
                <div>
                    <h1 className="text-3xl font-bold text-white flex items-center gap-3">
                        <Bookmark className="w-8 h-8 text-indigo-400" />
                        Saved
                    </h1>
                    <p className="text-zinc-500 mt-1">
                        {count} bookmark{count !== 1 ? 's' : ''} saved
                    </p>
                </div>

                {count > 0 && (
                    <button
                        onClick={exportBookmarks}
                        className="flex items-center gap-2 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-300 hover:text-white px-4 py-2.5 rounded-xl transition-all text-sm font-medium"
                    >
                        <Download className="w-4 h-4" />
                        Export Bookmarks
                    </button>
                )}
            </div>

            {/* Category pills */}
            <div className="flex gap-2 mb-6 flex-wrap">
                {[
                    { value: 'all', label: 'All', icon: '🌐' },
                    { value: 'text', label: 'Text', icon: '📝' },
                    { value: 'media', label: 'Media', icon: '🖼️' }
                ].map(cat => (
                    <button
                        key={cat.value}
                        onClick={() => setActiveCategory(cat.value as FeedCategory | 'all')}
                        className={`px-4 py-2 rounded-xl text-sm font-medium transition-all
                            ${activeCategory === cat.value
                                ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/20'
                                : 'bg-zinc-800/60 text-zinc-400 hover:bg-zinc-700/60 hover:text-zinc-300 border border-zinc-800'
                            }`}
                    >
                        <span className="mr-1.5">{cat.icon}</span>
                        {cat.label}
                    </button>
                ))}
            </div>

            {/* Empty state */}
            {count === 0 && (
                <div className="flex flex-col items-center justify-center py-24 text-center">
                    <div className="w-20 h-20 bg-zinc-800/50 rounded-2xl flex items-center justify-center mb-6">
                        <FolderOpen className="w-10 h-10 text-zinc-600" />
                    </div>
                    <h2 className="text-xl font-semibold text-zinc-400 mb-2">No bookmarks yet</h2>
                    <p className="text-zinc-600 max-w-sm">
                        Like posts from your feed to save them here. They'll be organized by category automatically.
                    </p>
                </div>
            )}

            {/* Pinterest-style masonry grid */}
            {count > 0 && (
                <div className="columns-1 sm:columns-2 lg:columns-3 xl:columns-4 gap-4 space-y-4">
                    {bookmarks.map(bookmark => (
                        <div
                            key={bookmark.url}
                            className="break-inside-avoid bg-zinc-900/80 backdrop-blur border border-zinc-800/60 rounded-2xl overflow-hidden group hover:border-zinc-700/80 hover:shadow-lg hover:shadow-black/20 transition-all duration-300"
                        >
                            {/* Thumbnail */}
                            {bookmark.thumbnail && (
                                <a href={bookmark.url} target="_blank" rel="noopener noreferrer">
                                    <div className="relative overflow-hidden">
                                        <img
                                            src={bookmark.thumbnail}
                                            alt=""
                                            className="w-full object-cover max-h-64 group-hover:scale-[1.02] transition-transform duration-500"
                                            loading="lazy"
                                            onError={(e) => {
                                                (e.target as HTMLImageElement).style.display = 'none';
                                            }}
                                        />
                                        <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                                    </div>
                                </a>
                            )}

                            {/* Content */}
                            <div className="p-4">
                                {/* Source badge */}
                                <div className="flex items-center justify-between mb-2">
                                    <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${SOURCE_COLORS[bookmark.source] || 'bg-zinc-700/40 text-zinc-400'}`}>
                                        {bookmark.source}
                                    </span>
                                    <span className="text-[11px] text-zinc-600">
                                        {new Date(bookmark.savedAt).toLocaleDateString()}
                                    </span>
                                </div>

                                {/* Title */}
                                <a
                                    href={bookmark.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="block"
                                >
                                    <h3 className="text-sm font-medium text-zinc-200 leading-snug mb-2 line-clamp-3 group-hover:text-white transition-colors">
                                        {bookmark.title}
                                    </h3>
                                </a>

                                {/* Author */}
                                <div className="flex items-center gap-2 mb-3">
                                    <img
                                        src={bookmark.authorAvatar}
                                        alt=""
                                        className="w-5 h-5 rounded-full"
                                    />
                                    <span className="text-xs text-zinc-500 truncate">
                                        {bookmark.authorName}
                                    </span>
                                </div>

                                {/* Actions */}
                                <div className="flex items-center gap-1 pt-2 border-t border-zinc-800/40">
                                    <button
                                        onClick={() => handleShare(bookmark.url)}
                                        className="flex items-center gap-1 text-zinc-600 hover:text-emerald-400 text-xs px-2 py-1 rounded-lg hover:bg-zinc-800/60 transition-all"
                                        title="Share"
                                    >
                                        <Share2 className="w-3.5 h-3.5" />
                                        <span>Share</span>
                                    </button>
                                    <a
                                        href={bookmark.url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="flex items-center gap-1 text-zinc-600 hover:text-white text-xs px-2 py-1 rounded-lg hover:bg-zinc-800/60 transition-all"
                                        title="Open original"
                                    >
                                        <ExternalLink className="w-3.5 h-3.5" />
                                        <span>Open</span>
                                    </a>
                                    <button
                                        onClick={() => remove(bookmark.url)}
                                        className="flex items-center gap-1 text-zinc-600 hover:text-rose-400 text-xs px-2 py-1 rounded-lg hover:bg-zinc-800/60 transition-all ml-auto"
                                        title="Remove bookmark"
                                    >
                                        <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
