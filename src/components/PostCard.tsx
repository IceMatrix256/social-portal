/**
 * PostCard — shared post card component used by both the network feeds
 * and the Discover mixed feed.
 */

import { useState, useRef } from "react";
import type { UnifiedPost } from "../adapters/types";
import { useLike, useComments } from "../hooks/usePostInteractions";
import { useBookmark } from "../hooks/useBookmarks";
import {
    MessageSquare, ExternalLink, Heart, Send,
    ChevronDown, ChevronUp, Trash2, Share2
} from "lucide-react";

// ── Source badge colors ───────────────────────────────────────────

export const SOURCE_COLORS: Record<string, string> = {
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
    misskey: 'bg-yellow-500/20 text-yellow-400',
    'nostr-photos': 'bg-fuchsia-500/20 text-fuchsia-400',
    'nostr-videos': 'bg-rose-500/20 text-rose-400',
    threads: 'bg-slate-500/20 text-slate-300',
};

// ── Comment input ─────────────────────────────────────────────────

function CommentInput({ onSubmit }: { onSubmit: (text: string) => void }) {
    const [text, setText] = useState("");
    const inputRef = useRef<HTMLInputElement>(null);

    const handleSubmit = () => {
        if (!text.trim()) return;
        onSubmit(text);
        setText("");
        inputRef.current?.focus();
    };

    return (
        <div className="flex gap-2 mt-3">
            <input
                ref={inputRef}
                type="text"
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
                placeholder="Write a comment…"
                className="flex-1 bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-indigo-500 transition-colors"
            />
            <button
                onClick={handleSubmit}
                disabled={!text.trim()}
                className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-30 disabled:cursor-not-allowed text-white p-2 rounded-lg transition-colors"
            >
                <Send className="w-4 h-4" />
            </button>
        </div>
    );
}

// ── PostCard ──────────────────────────────────────────────────────

export function PostCard({ post }: { post: UnifiedPost }) {
    const [expanded, setExpanded] = useState(false);
    const [shareToast, setShareToast] = useState(false);
    const { liked, toggleLike } = useLike(post.url);
    const { bookmarked, toggleBookmark } = useBookmark(post);
    const { comments, addComment, removeComment } = useComments(post.url);

    const handleLike = () => {
        toggleLike();
        if (!liked && !bookmarked) toggleBookmark();
        if (liked && bookmarked) toggleBookmark();
    };

    const handleShare = async (e: React.MouseEvent) => {
        e.stopPropagation();
        const shareData = {
            title: post.author.name,
            text: post.content.replace(/<[^>]+>/g, '').substring(0, 200),
            url: post.url,
        };
        try {
            if (navigator.share) {
                await navigator.share(shareData);
            } else {
                await navigator.clipboard.writeText(post.url);
                setShareToast(true);
                setTimeout(() => setShareToast(false), 2000);
            }
        } catch {
            // User cancelled share sheet
        }
    };

    return (
        <div className={`bg-zinc-900/80 backdrop-blur border rounded-2xl mb-4 transition-all duration-300 hover:shadow-lg hover:shadow-black/20 group ${expanded ? 'border-indigo-500/40 shadow-lg shadow-indigo-500/5' : 'border-zinc-800/60 hover:border-zinc-700/80'}`}>
            {/* Clickable header + content area */}
            <div
                className="p-5 cursor-pointer"
                onClick={() => setExpanded(!expanded)}
            >
                <div className="flex items-start gap-3">
                    <img
                        src={post.author.avatar}
                        alt={post.author.name}
                        className="w-11 h-11 rounded-full bg-zinc-800 object-cover ring-2 ring-zinc-800 group-hover:ring-zinc-700 transition-all"
                        onError={(e) => {
                            (e.target as HTMLImageElement).src = `https://api.dicebear.com/7.x/initials/svg?seed=${post.author.name}`;
                        }}
                    />
                    <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <span className="font-semibold text-zinc-100">{post.author.name}</span>
                                <span className="text-zinc-500 text-sm truncate max-w-[150px]">{post.author.handle}</span>
                            </div>
                            <div className="flex items-center gap-2 text-xs text-zinc-500">
                                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wider uppercase ${SOURCE_COLORS[post.source] || 'bg-zinc-800 text-zinc-400'}`}>
                                    {post.source}
                                </span>
                                <span>{new Date(post.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                            </div>
                        </div>

                        <div
                            className={`mt-2.5 text-zinc-300 text-sm leading-relaxed prose prose-invert max-w-none break-words prose-a:text-indigo-400 prose-a:no-underline hover:prose-a:underline ${!expanded ? 'line-clamp-4' : ''}`}
                            dangerouslySetInnerHTML={{ __html: post.content }}
                        />

                        {post.media.length > 0 && (
                            <div className={`mt-3 grid gap-2 ${post.media.length === 1 ? 'grid-cols-1' : 'grid-cols-2'}`}>
                                {post.media.map((m, i) => (
                                    <div key={i} className={`relative bg-black rounded-xl overflow-hidden ring-1 ring-zinc-800 ${m.type === 'video' || m.type === 'embed' ? 'aspect-video' : ''}`}>
                                        {m.type === 'video' ? (
                                            <video
                                                src={m.url}
                                                poster={m.previewUrl}
                                                controls
                                                preload="metadata"
                                                className="w-full h-full object-contain"
                                            />
                                        ) : m.type === 'embed' ? (
                                            <iframe
                                                src={m.url}
                                                title="Nostr event preview"
                                                className="w-full h-full border-0"
                                                sandbox="allow-scripts allow-same-origin"
                                                loading="lazy"
                                            />
                                        ) : (
                                            <img
                                                src={m.url}
                                                className="w-full max-h-[600px] object-contain"
                                                alt=""
                                                loading="lazy"
                                            />
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Action bar */}
            <div className="px-5 pb-4 flex items-center gap-4 border-t border-zinc-800/40 pt-3 mx-5 relative">
                <button
                    onClick={(e) => { e.stopPropagation(); handleLike(); }}
                    className={`flex items-center gap-1.5 text-sm transition-all ${liked ? 'text-rose-400' : 'text-zinc-500 hover:text-rose-400'}`}
                >
                    <Heart className={`w-4 h-4 transition-all ${liked ? 'fill-rose-400 scale-110' : ''}`} />
                    <span>{liked ? 'Saved' : 'Like'}</span>
                </button>

                <button
                    onClick={(e) => { e.stopPropagation(); setExpanded(!expanded); }}
                    className={`flex items-center gap-1.5 text-sm transition-colors ${expanded ? 'text-indigo-400' : 'text-zinc-500 hover:text-indigo-400'}`}
                >
                    <MessageSquare className="w-4 h-4" />
                    <span>Comment{comments.length > 0 ? ` (${comments.length})` : ''}</span>
                </button>

                <button
                    onClick={handleShare}
                    className="flex items-center gap-1.5 text-sm text-zinc-500 hover:text-emerald-400 transition-colors"
                >
                    <Share2 className="w-4 h-4" />
                    <span>Share</span>
                </button>

                <div className="ml-auto flex items-center gap-3">
                    <a
                        href={post.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="flex items-center gap-1.5 text-zinc-500 hover:text-white text-sm transition-colors"
                    >
                        <ExternalLink className="w-3.5 h-3.5" />
                        <span>Original</span>
                    </a>
                    <button
                        onClick={(e) => { e.stopPropagation(); setExpanded(!expanded); }}
                        className="text-zinc-600 hover:text-zinc-400 transition-colors"
                    >
                        {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </button>
                </div>

                {shareToast && (
                    <div className="absolute -top-10 left-1/2 -translate-x-1/2 bg-emerald-600 text-white text-xs px-3 py-1.5 rounded-lg shadow-lg animate-pulse whitespace-nowrap">
                        📋 Link copied to clipboard!
                    </div>
                )}
            </div>

            {/* Expanded: comments section */}
            {expanded && (
                <div className="px-5 pb-5 border-t border-zinc-800/40 mx-5 pt-4 animate-in slide-in-from-top-2 duration-200">
                    {comments.length > 0 ? (
                        <div className="space-y-3 mb-3">
                            {comments.map((c) => (
                                <div key={c.id} className="flex gap-3 group/comment">
                                    <img
                                        src={`https://api.dicebear.com/7.x/initials/svg?seed=${c.author}`}
                                        className="w-7 h-7 rounded-full bg-zinc-800"
                                        alt=""
                                    />
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-baseline gap-2">
                                            <span className="text-sm font-medium text-zinc-200">{c.author}</span>
                                            <span className="text-[11px] text-zinc-600">
                                                {new Date(c.timestamp).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                            </span>
                                            <button
                                                onClick={() => removeComment(c.id)}
                                                className="opacity-0 group-hover/comment:opacity-100 text-zinc-600 hover:text-red-400 transition-all ml-auto"
                                                title="Delete comment"
                                            >
                                                <Trash2 className="w-3 h-3" />
                                            </button>
                                        </div>
                                        <p className="text-sm text-zinc-400 mt-0.5">{c.text}</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <p className="text-zinc-600 text-sm mb-2">No comments yet. Be the first!</p>
                    )}

                    <CommentInput onSubmit={addComment} />
                </div>
            )}
        </div>
    );
}
