/**
 * Bookmark store — persists liked/saved posts in localStorage,
 * scoped per Polycentric identity and organized by feed category.
 * 
 * Note: Migration to IndexedDB is handled by secureStorage.ts
 */

import type { UnifiedPost } from '../adapters/types';
import type { FeedCategory } from '../hooks/useUnifiedFeed';
import { polycentricManager } from './polycentric/manager';

// ── Types ──────────────────────────────────────────────────────

export interface SavedBookmark {
    url: string;           // original post URL (unique key)
    title: string;         // post title or content preview
    source: string;        // adapter source name
    category: FeedCategory;
    thumbnail?: string;    // first media preview URL
    authorName: string;
    authorAvatar: string;
    authorHandle: string;
    savedAt: number;       // Unix ms
}

interface BookmarkStore {
    [url: string]: SavedBookmark;
}

// ── Source → Category mapping ──────────────────────────────────

// ── Source → Category mapping ──────────────────────────────────

function detectCategory(post: UnifiedPost): FeedCategory {
    if (post.media && post.media.length > 0) {
        return 'media';
    }
    return 'text';
}

function normalizeCategory(cat: string): FeedCategory {
    if (cat === 'social') return 'text';
    if (['photos', 'videos', 'links'].includes(cat)) return 'media';
    return cat as FeedCategory;
}

// ── Storage helpers ────────────────────────────────────────────

function storageKey(): string {
    const identity = polycentricManager.systemKey || 'anonymous';
    return `social-portal-bookmarks-${identity}`;
}

function loadStore(): BookmarkStore {
    try {
        const store = JSON.parse(localStorage.getItem(storageKey()) || '{}');
        // Migrate legacy categories on read-ish (or just handle in getBookmarks)
        return store;
    } catch {
        return {};
    }
}

function saveStore(store: BookmarkStore): void {
    localStorage.setItem(storageKey(), JSON.stringify(store));
}

// ── Strip HTML for clean title extraction ─────────────────────

function extractTitle(html: string): string {
    // Pull text from the first <strong> or <h3> tag, or first 120 chars of plain text
    const strongMatch = html.match(/<strong>(.*?)<\/strong>/i);
    if (strongMatch) return strongMatch[1].substring(0, 120);
    return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().substring(0, 120) || 'Untitled';
}

// ── Public API ─────────────────────────────────────────────────

/** Notify listeners when bookmarks change */
type Listener = () => void;
const listeners = new Set<Listener>();

export function subscribeBookmarks(listener: Listener): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
}

function notify(): void {
    listeners.forEach(fn => fn());
}

export function addBookmark(post: UnifiedPost): void {
    const store = loadStore();
    if (store[post.url]) return; // already bookmarked

    const bookmark: SavedBookmark = {
        url: post.url,
        title: extractTitle(post.content),
        source: post.source,
        category: detectCategory(post),
        thumbnail: post.media[0]?.previewUrl || post.media[0]?.url,
        authorName: post.author.name,
        authorAvatar: post.author.avatar,
        authorHandle: post.author.handle,
        savedAt: Date.now(),
    };

    store[post.url] = bookmark;
    saveStore(store);
    notify();
}

export function removeBookmark(url: string): void {
    const store = loadStore();
    if (!store[url]) return;
    delete store[url];
    saveStore(store);
    notify();
}

export function isBookmarked(url: string): boolean {
    const store = loadStore();
    return !!store[url];
}

export function getBookmarks(category?: FeedCategory | 'all'): SavedBookmark[] {
    const store = loadStore();
    let bookmarks = Object.values(store);

    if (category && category !== 'all') {
        bookmarks = bookmarks.filter(b => normalizeCategory(b.category) === category);
    }

    // Most recently saved first
    return bookmarks.sort((a, b) => b.savedAt - a.savedAt);
}

export function getBookmarkCount(category?: FeedCategory | 'all'): number {
    return getBookmarks(category).length;
}

// ── Export as Netscape Bookmark HTML ───────────────────────────

export function exportAsNetscapeHTML(): string {
    const bookmarks = getBookmarks();
    const byCategory = new Map<FeedCategory, SavedBookmark[]>();

    for (const b of bookmarks) {
        const cat = normalizeCategory(b.category);
        if (!byCategory.has(cat)) byCategory.set(cat, []);
        byCategory.get(cat)!.push(b);
    }

    const categoryLabels: Record<FeedCategory, string> = {
        text: 'Text',
        media: 'Media',
        all: 'All',
    };


    let html = `<!DOCTYPE NETSCAPE-Bookmark-file-1>
<!-- This is an automatically generated file.
     It will be read and overwritten.
     DO NOT EDIT! -->
<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">
<TITLE>Social Portal Bookmarks</TITLE>
<H1>Social Portal Saved</H1>
<DL><p>
`;

    for (const [cat, label] of Object.entries(categoryLabels)) {
        if (cat === 'all') continue;
        const items = byCategory.get(cat as FeedCategory) || [];
        if (items.length === 0) continue;

        html += `    <DT><H3>${label}</H3>\n    <DL><p>\n`;
        for (const b of items) {
            const ts = Math.floor(b.savedAt / 1000);
            const escapedTitle = b.title.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
            html += `        <DT><A HREF="${b.url}" ADD_DATE="${ts}">${escapedTitle}</A>\n`;
        }
        html += `    </DL><p>\n`;
    }

    html += `</DL><p>\n`;
    return html;
}

export function downloadBookmarksFile(): void {
    const html = exportAsNetscapeHTML();
    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'social-portal-bookmarks.html';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}
