// import * as Polycentric from '@polycentric/polycentric-core';
import { getPublicKey, utils, hashes } from '@noble/ed25519';
import { sha512 } from '@noble/hashes/sha2.js';
import { migrateFromLocalStorage } from '../secureStorage';

// Configure @noble/ed25519 v3
hashes.sha512 = sha512;

/**
 * Polycentric Manager with localStorage fallback.
 * 
 * Uses @noble/ed25519 for key generation, and the Polycentric SDK's
 * Protocol module for proper protobuf encoding/decoding.
 * Export produces a `polycentric://` URI compatible with Harbor and other clients.
 */

const LOCAL_IDENTITIES_KEY = 'social-portal-identities';
const ACTIVE_IDENTITY_KEY = 'social-portal-active-system';

// ── Fallback identity stored in localStorage ──────────────────────

interface LocalIdentity {
    username: string;
    systemKey: string;
    privateKey?: string;
    publicKey?: string;
    createdAt: string;
}

export interface IdentityInfo {
    system: string;
    username: string;
    isCurrent: boolean;
}

function getLocalIdentities(): Record<string, LocalIdentity> {
    try {
        const raw = localStorage.getItem(LOCAL_IDENTITIES_KEY);
        return raw ? JSON.parse(raw) : {};
    } catch { return {}; }
}

function saveLocalIdentity(identity: LocalIdentity): void {
    const all = getLocalIdentities();
    all[identity.systemKey] = identity;
    localStorage.setItem(LOCAL_IDENTITIES_KEY, JSON.stringify(all));
    localStorage.setItem(ACTIVE_IDENTITY_KEY, identity.systemKey);
}

function getActiveLocalIdentity(): LocalIdentity | null {
    const activeKey = localStorage.getItem(ACTIVE_IDENTITY_KEY);
    const all = getLocalIdentities();
    if (activeKey && all[activeKey]) return all[activeKey];
    const keys = Object.keys(all);
    if (keys.length > 0) return all[keys[0]];
    return null;
}

function deleteLocalIdentity(systemKey?: string): void {
    if (!systemKey) {
        localStorage.removeItem(ACTIVE_IDENTITY_KEY);
        return;
    }
    const all = getLocalIdentities();
    delete all[systemKey];
    localStorage.setItem(LOCAL_IDENTITIES_KEY, JSON.stringify(all));

    if (localStorage.getItem(ACTIVE_IDENTITY_KEY) === systemKey) {
        localStorage.removeItem(ACTIVE_IDENTITY_KEY);
    }
}

// ── Helpers ────────────────────────────────────────────────────────

function uint8ArrayToBase64(bytes: Uint8Array): string {
    let binary = '';
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return window.btoa(binary);
}

function base64ToUint8Array(base64: string): Uint8Array {
    const binary = window.atob(base64);
    const len = binary.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
        bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
}

/** Base64-URL encode (no padding), matching the SDK's encodeUrl function. */
function base64urlEncode(bytes: Uint8Array): string {
    const standard = uint8ArrayToBase64(bytes);
    return standard
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');
}

/** Base64-URL decode, accepting standard or URL-safe base64 with or without padding. */
function base64urlDecode(str: string): Uint8Array {
    // Restore standard base64
    let b64 = str.replace(/-/g, '+').replace(/_/g, '/');
    // Add padding
    while (b64.length % 4) b64 += '=';
    return base64ToUint8Array(b64);
}

// ── Module-level state ────────────────────────────────────────────

let processHandle: any = null;
let usingFallback = false;
let fallbackIdentity: LocalIdentity | null = null;

// Cache for the dynamically imported SDK Protocol module
let _Protocol: any = null;

async function getProtocol(): Promise<any> {
    if (_Protocol) return _Protocol;
    const poly: any = await import('@polycentric/polycentric-core');
    _Protocol = poly.Protocol || (poly.default && poly.default.Protocol);
    return _Protocol;
}

// ── Exported manager ──────────────────────────────────────────────

export const polycentricManager = {
    get processHandle() { return processHandle; },
    get isFallback() { return usingFallback; },

    get username(): string | null {
        if (fallbackIdentity) return fallbackIdentity.username;
        return null;
    },

    get systemKey(): string | null {
        if (fallbackIdentity) return fallbackIdentity.systemKey;
        return null;
    },

    get hasIdentity(): boolean {
        return !!fallbackIdentity;
    },

    async init(): Promise<boolean> {
        // Attempt migration from localStorage to IndexedDB on first run
        try {
            await migrateFromLocalStorage();
        } catch (e) {
            console.error('[Init] Migration failed:', e);
        }
        
        usingFallback = true;
        fallbackIdentity = getActiveLocalIdentity();
        return !!fallbackIdentity;
    },

    async createIdentity(nickname: string): Promise<void> {
        try {
            const privateKey = utils.randomSecretKey();
            const publicKey = getPublicKey(privateKey);

            const systemKey = 'key:' + uint8ArrayToBase64(publicKey).substring(0, 12);

            const newId: LocalIdentity = {
                username: nickname,
                systemKey: systemKey,
                privateKey: uint8ArrayToBase64(privateKey),
                publicKey: uint8ArrayToBase64(publicKey),
                createdAt: new Date().toISOString(),
            };

            saveLocalIdentity(newId);
            fallbackIdentity = newId;
            console.log("Created real cryptographic identity:", systemKey);
        } catch (e) {
            console.error("Failed to generate keys:", e);
        }
    },

    async deleteIdentity(): Promise<void> {
        processHandle = null;
        fallbackIdentity = null;
        deleteLocalIdentity();
        usingFallback = false;
    },

    async listIdentities(): Promise<IdentityInfo[]> {
        const all = getLocalIdentities();
        const activeKey = fallbackIdentity?.systemKey;

        return Object.values(all).map(id => ({
            system: id.systemKey,
            username: id.username,
            isCurrent: id.systemKey === activeKey
        }));
    },

    async switchIdentity(systemKey: string): Promise<boolean> {
        const all = getLocalIdentities();
        if (all[systemKey]) {
            localStorage.setItem(ACTIVE_IDENTITY_KEY, systemKey);
            fallbackIdentity = all[systemKey];
            return true;
        }
        return false;
    },

    async updateProfile(username?: string, _description?: string, _avatarUrl?: string): Promise<void> {
        if (fallbackIdentity) {
            if (username) {
                fallbackIdentity.username = username;
                saveLocalIdentity(fallbackIdentity);
            }
        }
    },

    /**
     * Exports the current identity as a `polycentric://` URI.
     * 
     * The format is:
     *   polycentric://<base64url(URLInfo { urlType=3, body=ExportBundle.encode(...) })>
     * 
     * This is compatible with Harbor and other standard Polycentric clients.
     */
    async exportIdentity(): Promise<string | null> {
        if (!fallbackIdentity || !fallbackIdentity.privateKey) {
            console.warn("No private key found for export.");
            return null;
        }

        try {
            const Protocol = await getProtocol();

            const privateKeyBytes = base64ToUint8Array(fallbackIdentity.privateKey);
            const publicKeyBytes = base64ToUint8Array(fallbackIdentity.publicKey || '');

            // Use the SDK's fromPartial to create properly-typed proto objects.
            // This ensures Long types are correct and compatible with the encoder.
            const keyPair = Protocol.KeyPair.fromPartial({
                keyType: 1, // Ed25519 — fromPartial will coerce to Long internally
                privateKey: privateKeyBytes,
                publicKey: publicKeyBytes,
            });

            const exportBundle = Protocol.ExportBundle.fromPartial({
                keyPair: keyPair,
                events: { events: [] },
            });

            // Encode ExportBundle to bytes
            const exportBundleBytes = Protocol.ExportBundle.encode(exportBundle).finish();

            // Wrap in URLInfo with urlType=3 (ExportBundle)
            const urlInfo = Protocol.URLInfo.fromPartial({
                urlType: 3,
                body: exportBundleBytes,
            });
            const urlInfoBytes = Protocol.URLInfo.encode(urlInfo).finish();

            // Base64url encode (no padding) and prefix with polycentric://
            const uri = 'polycentric://' + base64urlEncode(urlInfoBytes);

            console.log("Export URI:", uri);
            return uri;
        } catch (e) {
            console.error("Export failed:", e);
            return null;
        }
    },

    /**
     * Imports an identity from a `polycentric://` URI or raw base64 string.
     */
    async importIdentity(backupString: string): Promise<boolean> {
        try {
            const Protocol = await getProtocol();

            let exportBundle: any;

            if (backupString.startsWith('polycentric://')) {
                // Standard URI format: decode URLInfo wrapper
                const encoded = backupString.replace('polycentric://', '');
                const urlInfoBytes = base64urlDecode(encoded);
                const urlInfo = Protocol.URLInfo.decode(urlInfoBytes);

                // urlType 3 = ExportBundle
                exportBundle = Protocol.ExportBundle.decode(urlInfo.body);
            } else {
                // Legacy: try direct ExportBundle decode (standard base64)
                const bytes = base64ToUint8Array(backupString);
                exportBundle = Protocol.ExportBundle.decode(bytes);
            }

            if (exportBundle.keyPair && exportBundle.keyPair.privateKey) {
                const pkBytes = exportBundle.keyPair.privateKey;
                const pubBytes = exportBundle.keyPair.publicKey;

                const systemStr = 'key:' + uint8ArrayToBase64(pubBytes).substring(0, 12);

                const newId: LocalIdentity = {
                    username: "Imported User",
                    systemKey: systemStr,
                    privateKey: uint8ArrayToBase64(pkBytes),
                    publicKey: uint8ArrayToBase64(pubBytes),
                    createdAt: new Date().toISOString(),
                };

                saveLocalIdentity(newId);
                fallbackIdentity = newId;
                return true;
            }
        } catch (e) {
            console.error("Import failed:", e);
        }
        return false;
    },

    getError(): string | null {
        return null;
    },
};
