export const REDLIB_INSTANCES = [
    "www.reddit.com",
    "l.opnxng.com", "redlib.catsarch.com", "redlib.perennialte.ch", "redlib.r4fo.com",
    "redlib.cow.rip", "redlib.privacyredirect.com", "redlib.nadeko.net", "redlib.4o1x5.dev",
    "redlib.orangenet.cc", "rl.bloat.cat", "redlib.tux.pizza"
];

export const NITTER_INSTANCES = [
    "xcancel.com", "nuku.trabun.org", "nitter.privacyredirect.com", "nitter.poast.org",
    "nitter.net", "nitter.privacydev.net",
    "nitter.uni-sonia.com", "nitter.no-logs.com", "lightbrd.com"
];

import { fetchProxyContent } from "./proxy";

interface FetchOptions extends RequestInit {
    useProxyAsLastResort?: boolean;
    forceRefresh?: boolean;
    validate?: (content: string) => boolean;
}

/**
 * Tries multiple instances for a platform, falling back to a CORS proxy if all fail.
 */
export async function fetchWithInstanceFallback(
    path: string,
    instances: string[],
    options: FetchOptions = { useProxyAsLastResort: true }
): Promise<string> {
    // Shuffle instances to distribute load
    const shuffled = [...instances].sort(() => Math.random() - 0.5);

    for (const instance of shuffled) {
        try {
            const url = `https://${instance}${path.startsWith('/') ? '' : '/'}${path}`;
            console.log(`[Instances] Trying ${url}...`);

            const controller = new AbortController();
            // timeoutId removed as fetchProxyContent handles REQUEST_TIMEOUT_MS internally

            const text = await fetchProxyContent(url, {
                ...options,
                signal: controller.signal
            });

            // If validation is provided, check if content is actually what we expect
            if (options.validate && !options.validate(text)) {
                console.warn(`[Instances] ${instance} returned 200 OK but failed content validation.`);
                continue;
            }
            return text;
        } catch (error) {
            console.warn(`[Instances] ${instance} failed:`, error);
        }
    }

    if (options.useProxyAsLastResort) {
        // Just use the first (representative) instance for the proxy attempt
        // because the proxy handles it anyway, but we need a valid absolute URL.
        const defaultUrl = `https://${instances[0]}${path.startsWith('/') ? '' : '/'}${path}`;
        console.log(`[Instances] All instances failed or invalid, trying CORS proxy fallback via ${defaultUrl}`);
        return await fetchProxyContent(defaultUrl, options);
    }

    throw new Error(`All ${instances.length} instances failed/invalid and no proxy fallback was used.`);
}
