/**
 * Password-based encryption for private keys and sensitive data
 * Uses AES-256-GCM with PBKDF2 key derivation (600,000 iterations per OWASP 2023)
 */

/**
 * Derives an encryption key from user password using PBKDF2
 */
async function deriveKey(password: string, salt: Uint8Array): Promise<CryptoKey> {
    const encoder = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey(
        'raw',
        encoder.encode(password),
        'PBKDF2',
        false,
        ['deriveBits', 'deriveKey']
    );
    
    return crypto.subtle.deriveKey(
        {
            name: 'PBKDF2',
            salt: salt as BufferSource,
            iterations: 600000,  // OWASP 2023 recommendation
            hash: 'SHA-256'
        },
        keyMaterial,
        { name: 'AES-GCM', length: 256 },
        false,
        ['encrypt', 'decrypt']
    );
}

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

export interface EncryptedData {
    encrypted: string;
    salt: string;
    iv: string;
}

/**
 * Encrypts data with AES-256-GCM
 */
export async function encryptData(plaintext: string, password: string): Promise<EncryptedData> {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const key = await deriveKey(password, salt);
    
    const encoder = new TextEncoder();
    const data = encoder.encode(plaintext);
    
    const encrypted = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv },
        key,
        data
    );
    
    return {
        encrypted: uint8ArrayToBase64(new Uint8Array(encrypted)),
        salt: uint8ArrayToBase64(salt),
        iv: uint8ArrayToBase64(iv)
    };
}

/**
 * Decrypts data
 */
export async function decryptData(encryptedData: EncryptedData, password: string): Promise<string> {
    const salt = base64ToUint8Array(encryptedData.salt);
    const iv = base64ToUint8Array(encryptedData.iv);
    const ciphertext = base64ToUint8Array(encryptedData.encrypted);
    
    const key = await deriveKey(password, salt);
    
    try {
        const decrypted = await crypto.subtle.decrypt(
            { name: 'AES-GCM', iv: iv as BufferSource },
            key,
            ciphertext as BufferSource
        );
        
        const decoder = new TextDecoder();
        return decoder.decode(decrypted);
    } catch {
        throw new Error('Incorrect password or corrupted data');
    }
}

/**
 * Verifies if a password is correct by trying to decrypt test data
 */
export async function verifyPassword(encryptedData: EncryptedData, password: string): Promise<boolean> {
    try {
        await decryptData(encryptedData, password);
        return true;
    } catch {
        return false;
    }
}
