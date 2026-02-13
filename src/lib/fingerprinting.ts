/**
 * Anti-fingerprinting utilities to enhance privacy
 */

const USER_AGENTS = [
    // Chrome on Windows
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    // Chrome on macOS
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    // Firefox on Windows
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
    // Firefox on macOS
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:121.0) Gecko/20100101 Firefox/121.0',
    // Chrome on Linux
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    // Safari on macOS
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Safari/605.1.15'
];

let currentUserAgent: string | null = null;
let lastRotation: number = 0;
const ROTATION_INTERVAL = 30 * 60 * 1000; // Rotate every 30 minutes

/**
 * Get a random user agent string
 * Caches the result for 30 minutes to avoid inconsistent behavior
 */
export function getRandomUserAgent(): string {
    const now = Date.now();
    
    // Rotate every 30 minutes
    if (!currentUserAgent || (now - lastRotation) > ROTATION_INTERVAL) {
        currentUserAgent = USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
        lastRotation = now;
        console.log('[Privacy] User-Agent rotated');
    }
    
    return currentUserAgent;
}

/**
 * Add random timing jitter to requests to avoid timing-based fingerprinting
 */
export async function addRandomDelay(minMs: number = 50, maxMs: number = 200): Promise<void> {
    const delay = Math.random() * (maxMs - minMs) + minMs;
    await new Promise(resolve => setTimeout(resolve, delay));
}

/**
 * Normalize request headers to reduce fingerprinting surface
 */
export function getNormalizedHeaders(customHeaders?: HeadersInit): HeadersInit {
    return {
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
        'DNT': '1',  // Do Not Track
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Upgrade-Insecure-Requests': '1',
        ...customHeaders
    };
}
