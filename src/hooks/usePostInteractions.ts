import { useState, useCallback, useEffect } from 'react';
import { polycentricManager } from '../lib/polycentric/manager';
import { STORAGE_KEYS, loadSyncedJSON, saveSyncedJSON, migrateLegacyKey, getScopedStorageKey } from '../lib/sync';

// ── Types ─────────────────────────────────────────────────────────

export interface PostComment {
    id: string;
    author: string;
    text: string;
    timestamp: number;
}

interface LikesStore {
    [postUrl: string]: boolean;
}

interface CommentsStore {
    [postUrl: string]: PostComment[];
}

function identityKey(): string {
    return polycentricManager.systemKey || 'anonymous';
}

function loadLikes(): LikesStore {
    const identity = identityKey();
    migrateLegacyKey(STORAGE_KEYS.likes, getScopedStorageKey(STORAGE_KEYS.likes, identity));
    return loadSyncedJSON<LikesStore>(STORAGE_KEYS.likes, identity, {});
}

function saveLikes(likes: LikesStore) {
    saveSyncedJSON(STORAGE_KEYS.likes, identityKey(), likes);
}

function loadComments(): CommentsStore {
    const identity = identityKey();
    migrateLegacyKey(STORAGE_KEYS.comments, getScopedStorageKey(STORAGE_KEYS.comments, identity));
    return loadSyncedJSON<CommentsStore>(STORAGE_KEYS.comments, identity, {});
}

function saveComments(comments: CommentsStore) {
    saveSyncedJSON(STORAGE_KEYS.comments, identityKey(), comments);
}

// ── Hooks ─────────────────────────────────────────────────────────

export function useLike(postUrl: string) {
    const [liked, setLiked] = useState(() => {
        const store = loadLikes();
        return !!store[postUrl];
    });

    useEffect(() => {
        const onSync = (e: any) => {
            if (e?.detail?.baseKey !== STORAGE_KEYS.likes) return;
            if (e?.detail?.identity !== identityKey()) return;
            const store = loadLikes();
            setLiked(!!store[postUrl]);
        };
        window.addEventListener('social-portal-sync', onSync);
        return () => window.removeEventListener('social-portal-sync', onSync);
    }, [postUrl]);

    const toggleLike = useCallback(() => {
        const store = loadLikes();
        const next = !store[postUrl];
        if (next) {
            store[postUrl] = true;
        } else {
            delete store[postUrl];
        }
        saveLikes(store);
        setLiked(next);
    }, [postUrl]);

    return { liked, toggleLike };
}

export function useComments(postUrl: string) {
    const [comments, setComments] = useState<PostComment[]>(() => {
        const store = loadComments();
        return store[postUrl] || [];
    });

    // Sync when postUrl changes
    useEffect(() => {
        const store = loadComments();
        setComments(store[postUrl] || []);
    }, [postUrl]);

    useEffect(() => {
        const onSync = (e: any) => {
            if (e?.detail?.baseKey !== STORAGE_KEYS.comments) return;
            if (e?.detail?.identity !== identityKey()) return;
            const store = loadComments();
            setComments(store[postUrl] || []);
        };
        window.addEventListener('social-portal-sync', onSync);
        return () => window.removeEventListener('social-portal-sync', onSync);
    }, [postUrl]);

    const addComment = useCallback((text: string) => {
        const trimmed = text.trim();
        if (!trimmed) return;

        const comment: PostComment = {
            id: crypto.randomUUID(),
            author: polycentricManager.username || 'Anonymous',
            text: trimmed,
            timestamp: Date.now(),
        };

        const store = loadComments();
        if (!store[postUrl]) store[postUrl] = [];
        store[postUrl].push(comment);
        saveComments(store);
        setComments([...store[postUrl]]);
    }, [postUrl]);

    const removeComment = useCallback((commentId: string) => {
        const store = loadComments();
        if (store[postUrl]) {
            store[postUrl] = store[postUrl].filter(c => c.id !== commentId);
            saveComments(store);
            setComments([...store[postUrl]]);
        }
    }, [postUrl]);

    return { comments, addComment, removeComment };
}
