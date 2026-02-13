import { getRandomUserAgent } from './fingerprinting';

// Configuration constants
const RETRIES_PER_PROXY = 2;
const RETRY_BASE_DELAY_MS = 1000;
const REQUEST_TIMEOUT_MS = 15000;
const DIRECT_FETCH_HOSTS = new Set([
    'public.api.bsky.app',
    'mastodon.social',
    'misskey.io',
    'misskey.design',
]);

/**
 * List of CORS proxy services to try in order
 * First one is preferred, others are fallbacks
 */
const PROXY_SERVICES: Array<{
    name: string;
    url: string;
    parseResponse: (response: Response) => Promise<string>;
    enabled?: () => boolean;
}> = [
    {
        name: 'allorigins',
        url: 'https://api.allorigins.win/get?url=',
        parseResponse: async (response: Response) => {
            const wrapper = await response.json();
            return wrapper.contents;
        }
    },
    {
        name: 'corsproxy',
        url: 'https://corsproxy.io/?',
        parseResponse: async (response: Response) => {
            return await response.text();
        }
    },
    {
        name: 'cors-anywhere',
        url: 'https://cors-anywhere.herokuapp.com/',
        parseResponse: async (response: Response) => {
            return await response.text();
        }
    },
    // Placeholder for self-hosted proxy
    {
        name: 'self-hosted',
        url: import.meta.env.VITE_CORS_PROXY_URL || '',
        parseResponse: async (response: Response) => {
            return await response.text();
        },
        enabled: () => !!import.meta.env.VITE_CORS_PROXY_URL
    }
];

/**
 * Exponential backoff retry logic
 */
async function retryWithBackoff<T>(
    fn: () => Promise<T>,
    maxRetries: number = 3,
    baseDelay: number = 1000
): Promise<T> {
    let lastError: Error | null = null;
    
    for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
            return await fn();
        } catch (error) {
            lastError = error as Error;
            
            if (attempt < maxRetries - 1) {
                const delay = baseDelay * Math.pow(2, attempt);
                console.log(`[Retry] Attempt ${attempt + 1} failed, retrying in ${delay}ms...`);
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
    }
    
    throw lastError || new Error('All retry attempts failed');
}

export function getProxyUrl(targetUrl: string): string {
    // Detect if we are running in a native Capacitor environment
    const isNative = (window as Window & { Capacitor?: { isNative?: boolean } }).Capacitor?.isNative;

    // Misskey instances usually support CORS, and our proxy gets blocked by Cloudflare (403)
    if (targetUrl.includes('misskey.io') || targetUrl.includes('misskey.design')) {
        return targetUrl;
    }

    // In Development (Web), we use Vite's proxy.
    // In Native (Android APK), we MUST use a public proxy because localhost:8090 isn't available.
    if (import.meta.env.DEV && !isNative) {
        if (targetUrl.includes('reddit.com')) {
            return targetUrl.replace(/^https?:\/\/(www\.)?reddit\.com/, '/api/reddit');
        }
        if (targetUrl.includes('mastodon.social')) {
            return targetUrl.replace(/^https?:\/\/(www\.)?mastodon\.social/, '/api/mastodon');
        }
        if (targetUrl.includes('api.nostr.band')) {
            return targetUrl.replace(/^https?:\/\/api\.nostr\.band/, '/api/nostr');
        }
        if (targetUrl.includes('lemmy.world')) {
            return targetUrl.replace(/^https?:\/\/(www\.)?lemmy\.world/, '/api/lemmy');
        }
        if (targetUrl.includes('public.api.bsky.app')) {
            return targetUrl.replace(/^https?:\/\/public\.api\.bsky\.app/, '/api/bluesky');
        }
        if (targetUrl.includes('misskey.io')) {
            return targetUrl.replace(/^https?:\/\/misskey\.io/, '/api/misskey');
        }
        if (targetUrl.includes('misskey.design')) {
            return targetUrl.replace(/^https?:\/\/misskey\.design/, '/api/misskey-design');
        }
        if (targetUrl.includes('piefed.social')) {
            return targetUrl.replace(/^https?:\/\/piefed\.social/, '/api/custom-feed');
        }
    }

    // In Production (or unexpected envs), fall back to public proxy or relative path
    return `https://api.allorigins.win/get?url=${encodeURIComponent(targetUrl)}`;
}

/**
 * Fetches content through multiple proxy services with fallback
 */
export async function fetchProxyContent(targetUrl: string, options?: RequestInit): Promise<string> {
    const isNative = (window as Window & { Capacitor?: { isNative?: boolean } }).Capacitor?.isNative;
    
    // For native apps or production, try multiple proxies
    if (import.meta.env.PROD || isNative) {
        const directHost = (() => {
            try {
                return new URL(targetUrl).hostname.toLowerCase();
            } catch {
                return '';
            }
        })();

        if (DIRECT_FETCH_HOSTS.has(directHost)) {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

            try {
                const response = await fetch(targetUrl, {
                    ...options,
                    signal: controller.signal
                });

                if (response.ok) {
                    return await response.text();
                }
            } catch (error) {
                console.warn(`[Proxy] Direct fetch failed for ${directHost}, falling back to proxies:`, error);
            } finally {
                clearTimeout(timeoutId);
            }
        }

        const enabledProxies = PROXY_SERVICES.filter(p => !p.enabled || p.enabled());
        const errors: Array<{ proxy: string; error: string }> = [];
        
        for (const proxy of enabledProxies) {
            if (!proxy.url) continue;
            
            try {
                console.log(`[Proxy] Trying ${proxy.name}...`);
                
                const result = await retryWithBackoff(async () => {
                    const proxyUrl = proxy.url + encodeURIComponent(targetUrl);
                    const controller = new AbortController();
                    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
                    
                    try {
                        const response = await fetch(proxyUrl, {
                            ...options,
                            signal: controller.signal,
                            headers: {
                                ...options?.headers,
                                'User-Agent': getRandomUserAgent()
                            }
                        });
                        clearTimeout(timeoutId);
                        
                        if (!response.ok) {
                            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                        }
                        
                        return await proxy.parseResponse(response);
                    } catch (error) {
                        clearTimeout(timeoutId);
                        throw error;
                    }
                }, RETRIES_PER_PROXY, RETRY_BASE_DELAY_MS);  // Retries per proxy
                
                console.log(`[Proxy] Success with ${proxy.name}`);
                return result;
                
            } catch (error) {
                const errorMsg = error instanceof Error ? error.message : String(error);
                errors.push({ proxy: proxy.name, error: errorMsg });
                console.warn(`[Proxy] ${proxy.name} failed:`, error);
                continue;
            }
        }
        
        // Include all proxy failures in error message
        const failureSummary = errors.map(e => `${e.proxy}: ${e.error}`).join('; ');
        throw new Error(`All proxies failed. Errors: ${failureSummary}`);
    }
    
    // Development mode: use Vite proxy
    const url = getProxyUrl(targetUrl);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    
    try {
        const response = await fetch(url, {
            ...options,
            signal: controller.signal
        });
        clearTimeout(timeoutId);
        
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        
        if (url.includes('allorigins.win')) {
            const wrapper = await response.json();
            return wrapper.contents;
        } else {
            return await response.text();
        }
    } catch (error) {
        clearTimeout(timeoutId);
        throw error;
    }
}
