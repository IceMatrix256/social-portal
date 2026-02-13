import Dexie from 'dexie';
import { type EncryptedData } from './encryption';

// Storage key constants
const STORAGE_KEY_IDENTITIES = 'social-portal-identities';
const STORAGE_KEY_BOOKMARKS_PREFIX = 'social-portal-bookmarks-';

interface StoredIdentity {
    systemKey: string;
    username: string;
    privateKey?: string;  // Plaintext (if no password)
    encryptedPrivateKey?: EncryptedData;  // Encrypted (if password set)
    publicKey?: string;
    createdAt: string;
    requiresPassword: boolean;
}

interface StoredBookmarks {
    identityKey: string;
    data: string;  // JSON string (plaintext or encrypted)
    encryptedData?: EncryptedData;
    requiresPassword: boolean;
}

class SecureDatabase extends Dexie {
    identities: Dexie.Table<StoredIdentity, string>;
    bookmarks: Dexie.Table<StoredBookmarks, string>;
    
    constructor() {
        super('SocialPortalSecure');
        this.version(1).stores({
            identities: 'systemKey, username',
            bookmarks: 'identityKey'
        });
        this.identities = this.table('identities');
        this.bookmarks = this.table('bookmarks');
    }
}

export const secureDB = new SecureDatabase();

// Session password storage (in memory only)
let sessionPassword: string | null = null;
let passwordRequired: boolean = false;

export function setSessionPassword(password: string | null) {
    sessionPassword = password;
}

export function getSessionPassword(): string | null {
    return sessionPassword;
}

export function isPasswordRequired(): boolean {
    return passwordRequired;
}

export function setPasswordRequired(required: boolean) {
    passwordRequired = required;
}

/**
 * Migrate from localStorage to IndexedDB
 */
export async function migrateFromLocalStorage() {
    // Migrate identities
    try {
        const oldIdentities = localStorage.getItem(STORAGE_KEY_IDENTITIES);
        if (oldIdentities) {
            let parsed;
            try {
                parsed = JSON.parse(oldIdentities);
            } catch (parseError) {
                console.error('[Migration] Failed to parse identities JSON:', parseError);
                return;
            }
            
            for (const [systemKey, identity] of Object.entries(parsed as Record<string, {
                username?: string;
                privateKey?: string;
                publicKey?: string;
                createdAt?: string;
            }>)) {
                const existing = await secureDB.identities.get(systemKey);
                if (!existing) {
                    await secureDB.identities.add({
                        systemKey,
                        username: identity.username || 'Unknown',
                        privateKey: identity.privateKey,
                        publicKey: identity.publicKey,
                        createdAt: identity.createdAt || new Date().toISOString(),
                        requiresPassword: false
                    });
                }
            }
            console.log('[Migration] Identities migrated to IndexedDB');
        }
    } catch (e) {
        console.error('[Migration] Failed to migrate identities:', e);
    }
    
    // Migrate bookmarks
    try {
        const keys = Object.keys(localStorage).filter(k => k.startsWith(STORAGE_KEY_BOOKMARKS_PREFIX));
        for (const key of keys) {
            const identityKey = key.replace(STORAGE_KEY_BOOKMARKS_PREFIX, '');
            const existing = await secureDB.bookmarks.get(identityKey);
            if (!existing) {
                const data = localStorage.getItem(key);
                if (data) {
                    await secureDB.bookmarks.add({
                        identityKey,
                        data,
                        requiresPassword: false
                    });
                }
            }
        }
        console.log('[Migration] Bookmarks migrated to IndexedDB');
    } catch (e) {
        console.error('[Migration] Failed to migrate bookmarks:', e);
    }
}
