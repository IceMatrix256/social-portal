import Gun from 'gun';

export const STORAGE_KEYS = {
  gunPeers: 'social-portal-gun-peers',
  pins: 'social-portal-pinned-networks',
  topics: 'social-portal-topics',
  customRss: 'social-portal-custom-rss',
  likes: 'social-portal-likes',
  comments: 'social-portal-comments',
  bookmarks: 'social-portal-bookmarks',
  threadsTrendingHandles: 'social-portal-threads-trending-handles',
} as const;

const SYNC_META_BASE_KEY = 'social-portal-sync-meta';

export function getScopedStorageKey(baseKey: string, identity: string | null | undefined): string {
  return `${baseKey}:${identity || 'anonymous'}`;
}

export function getGunPeersConfig(): string {
  const envPeers = (import.meta as any).env?.VITE_GUN_PEERS;
  if (typeof envPeers === 'string' && envPeers.trim()) return envPeers.trim();
  try {
    return localStorage.getItem(STORAGE_KEYS.gunPeers) || '';
  } catch {
    return '';
  }
}

export function setGunPeersConfig(peersCsv: string): void {
  try {
    localStorage.setItem(STORAGE_KEYS.gunPeers, peersCsv);
  } catch {
    // ignore
  }
}

function parsePeers(peersCsv: string): string[] {
  return peersCsv
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean);
}

// Initialize Gun with optional peers (for real cross-device sync).
const gunPeers = parsePeers(getGunPeersConfig());
const gun = gunPeers.length > 0 ? Gun({ peers: gunPeers }) : Gun();

const CHUNK_KEY_PREFIX = 'social-portal-chunk:';

async function sha256Base64Url(input: string): Promise<string> {
  if (!(globalThis as any).crypto?.subtle?.digest) {
    // Fallback for non-secure contexts; only used for local chunk IDs.
    return `rand-${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
  }
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  const arr = Array.from(new Uint8Array(digest));
  const b64 = btoa(String.fromCharCode(...arr));
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// Local chunk store (content-addressed). This keeps the browser bundle buildable;
// IPFS can be reintroduced behind a dedicated build/runtime later.
export async function storeChunk(data: string): Promise<string> {
  const cid = `local:${await sha256Base64Url(data)}`;
  try {
    localStorage.setItem(`${CHUNK_KEY_PREFIX}${cid}`, data);
  } catch {
    // ignore
  }
  return cid;
}

export async function retrieveChunk(cid: string): Promise<string> {
  try {
    return localStorage.getItem(`${CHUNK_KEY_PREFIX}${cid}`) || '';
  } catch {
    return '';
  }
}

// For P2P sync using Gun
export const syncDB = gun.get('social-portal');

// Sync identities
export function syncIdentities(identities: any) {
  syncDB.get('identities').put(identities);
}

// Get synced identities
export function getSyncedIdentities(callback: (data: any) => void) {
  syncDB.get('identities').on(callback);
}

type SyncMeta = Record<string, number>;

function loadMeta(identity: string | null | undefined): SyncMeta {
  try {
    const raw = localStorage.getItem(getScopedStorageKey(SYNC_META_BASE_KEY, identity));
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveMeta(identity: string | null | undefined, meta: SyncMeta): void {
  try {
    localStorage.setItem(getScopedStorageKey(SYNC_META_BASE_KEY, identity), JSON.stringify(meta));
  } catch {
    // ignore
  }
}

export function migrateLegacyKey(legacyKey: string, newKey: string): void {
  try {
    if (localStorage.getItem(newKey) != null) return;
    const legacy = localStorage.getItem(legacyKey);
    if (legacy == null) return;
    localStorage.setItem(newKey, legacy);
  } catch {
    // ignore
  }
}

export function saveSyncedJSON(baseKey: string, identity: string | null | undefined, data: unknown): void {
  const scopedKey = getScopedStorageKey(baseKey, identity);
  const value = JSON.stringify(data);
  const updatedAt = Date.now();

  try {
    localStorage.setItem(scopedKey, value);
  } catch {
    // ignore
  }

  const meta = loadMeta(identity);
  meta[baseKey] = updatedAt;
  saveMeta(identity, meta);

  syncDB.get('state').get(identity || 'anonymous').get(baseKey).put({ updatedAt, value });
}

export function loadSyncedJSON<T>(baseKey: string, identity: string | null | undefined, fallback: T): T {
  const scopedKey = getScopedStorageKey(baseKey, identity);
  try {
    const raw = localStorage.getItem(scopedKey);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function startSyncedJSON(baseKey: string, identity: string | null | undefined): void {
  const id = identity || 'anonymous';
  const meta = loadMeta(identity);
  const localUpdatedAt = meta[baseKey] || 0;

  syncDB.get('state').get(id).get(baseKey).on((data: any) => {
    if (!data || typeof data !== 'object') return;
    if (typeof data.value !== 'string' || typeof data.updatedAt !== 'number') return;
    if (data.updatedAt <= (loadMeta(identity)[baseKey] || 0)) return;

    try {
      localStorage.setItem(getScopedStorageKey(baseKey, identity), data.value);
      const nextMeta = loadMeta(identity);
      nextMeta[baseKey] = data.updatedAt;
      saveMeta(identity, nextMeta);
      window.dispatchEvent(new CustomEvent('social-portal-sync', { detail: { baseKey, identity: id } }));
    } catch {
      // ignore
    }
  });

  // Bootstrap local state into the network if we have it.
  // (Last-write-wins via updatedAt.)
  try {
    const raw = localStorage.getItem(getScopedStorageKey(baseKey, identity));
    if (raw != null && localUpdatedAt === 0) {
      const updatedAt = Date.now();
      meta[baseKey] = updatedAt;
      saveMeta(identity, meta);
      syncDB.get('state').get(id).get(baseKey).put({ updatedAt, value: raw });
    }
  } catch {
    // ignore
  }
}

// To preserve anti-tracking, use local relay or P2P without central server
// Gun can use peers, but for simplicity, keep local
