/**
 * Dashboard — Network Directory
 *
 * Shows all connected networks as visually rich cards.
 * Pin your favorites — they appear at the top for quick access.
 * Click a network → its raw chronological feed appears below.
 * No algorithm, no mixing — what shows, shows.
 */

import { useState, useCallback, useEffect } from "react";
import { useUnifiedFeed } from "../hooks/useUnifiedFeed";
import { PostCard } from "../components/PostCard";
import {
    Globe, Zap, Cloud, Radio, Camera, Image, MessageCircle,
    Video, Link2, Rss, Loader2, ArrowLeft, ChevronRight, Pin, PinOff, ChevronDown, RefreshCw
} from "lucide-react";
import { LoadMoreTrigger } from "../components/LoadMoreTrigger";
import { ErrorRetry } from "../components/ErrorRetry";
import { polycentricManager } from "../lib/polycentric/manager";
import { loadSyncedJSON, saveSyncedJSON, migrateLegacyKey, STORAGE_KEYS, getScopedStorageKey } from "../lib/sync";

// ── Network definitions ──────────────────────────────────────────

interface NetworkDef {
    id: string;
    name: string;
    desc: string;
    icon: React.ElementType;
    gradient: string;
    shadow: string;
    category: 'social' | 'photos' | 'videos' | 'links';
}

// NETWORKS definition follows...
const NETWORKS: NetworkDef[] = [
    // Social
    {
        id: 'mastodon', name: 'Mastodon',
        desc: 'Federated, open social network',
        icon: Globe, gradient: 'from-indigo-600 to-violet-600', shadow: 'shadow-indigo-500/20',
        category: 'social',
    },
    {
        id: 'nostr', name: 'Nostr',
        desc: 'Censorship-resistant relay network',
        icon: Zap, gradient: 'from-purple-600 to-fuchsia-600', shadow: 'shadow-purple-500/20',
        category: 'social',
    },
    {
        id: 'bluesky', name: 'Bluesky',
        desc: 'AT Protocol social network',
        icon: Cloud, gradient: 'from-sky-500 to-blue-600', shadow: 'shadow-sky-500/20',
        category: 'social',
    },
    {
        id: 'misskey', name: 'Misskey',
        desc: 'Fediverse microblogging platform',
        icon: Radio, gradient: 'from-yellow-500 to-amber-600', shadow: 'shadow-yellow-500/20',
        category: 'social',
    },
    {
        id: 'threads', name: 'Threads',
        desc: 'Public profile feed (curated trending)',
        icon: MessageCircle, gradient: 'from-zinc-500 to-slate-600', shadow: 'shadow-zinc-500/20',
        category: 'social',
    },
    // Photos
    {
        id: 'pixelfed', name: 'Pixelfed',
        desc: 'Federated photo sharing',
        icon: Camera, gradient: 'from-pink-500 to-rose-600', shadow: 'shadow-pink-500/20',
        category: 'photos',
    },
    {
        id: 'imgur', name: 'Imgur',
        desc: 'Image hosting & community',
        icon: Image, gradient: 'from-emerald-500 to-green-600', shadow: 'shadow-emerald-500/20',
        category: 'photos',
    },
    {
        id: 'piefed', name: 'PieFed',
        desc: 'Fediverse link aggregation',
        icon: MessageCircle, gradient: 'from-lime-500 to-green-600', shadow: 'shadow-lime-500/20',
        category: 'photos',
    },
    {
        id: 'nostr photos', name: 'Nostr Photos',
        desc: 'Photos shared over Nostr relays',
        icon: Camera, gradient: 'from-fuchsia-500 to-purple-600', shadow: 'shadow-fuchsia-500/20',
        category: 'photos',
    },
    // Videos
    {
        id: 'nostr videos', name: 'Nostr Videos',
        desc: 'Videos shared over Nostr relays',
        icon: Video, gradient: 'from-rose-500 to-red-600', shadow: 'shadow-rose-500/20',
        category: 'videos',
    },
    {
        id: 'reddit', name: 'Reddit',
        desc: 'Popular link aggregation (via Redlib)',
        icon: Link2, gradient: 'from-orange-500 to-red-600', shadow: 'shadow-orange-500/20',
        category: 'links',
    },
    {
        id: 'lemmy', name: 'Lemmy',
        desc: 'Federated Reddit alternative',
        icon: MessageCircle, gradient: 'from-teal-500 to-cyan-600', shadow: 'shadow-teal-500/20',
        category: 'links',
    },
    {
        id: 'rss', name: 'RSS Feeds',
        desc: 'Hacker News, Lobsters & more',
        icon: Rss, gradient: 'from-amber-500 to-orange-600', shadow: 'shadow-amber-500/20',
        category: 'links',
    },
];

const SECTIONS = [
    { key: 'social', label: '💬 Social', desc: 'Microblogging & conversation' },
    { key: 'photos', label: '📸 Photos', desc: 'Image sharing communities' },
    { key: 'videos', label: '🎬 Videos', desc: 'Video content' },
    { key: 'links', label: '🔗 Links', desc: 'News, links & aggregators' },
] as const;

// ── Pin persistence (identity-scoped + syncable) ──────────────────

function loadPins(identity: string | null | undefined): string[] {
    migrateLegacyKey(STORAGE_KEYS.pins, getScopedStorageKey(STORAGE_KEYS.pins, identity));
    return loadSyncedJSON<string[]>(STORAGE_KEYS.pins, identity, []);
}

function savePins(identity: string | null | undefined, pins: string[]) {
    saveSyncedJSON(STORAGE_KEYS.pins, identity, pins);
}

// ── Network Card ─────────────────────────────────────────────────

function NetworkCard({ net, pinned, onSelect, onTogglePin }: {
    net: NetworkDef;
    pinned: boolean;
    onSelect: () => void;
    onTogglePin: (e: React.MouseEvent) => void;
}) {
    return (
        <div className="relative group">
            <button
                onClick={onSelect}
                className={`w-full relative p-5 rounded-2xl border bg-zinc-900/60 hover:bg-zinc-900/80 transition-all duration-300 text-left overflow-hidden ${pinned
                    ? 'border-indigo-500/40 shadow-lg shadow-indigo-500/5'
                    : 'border-zinc-800/60 hover:border-zinc-700'
                    }`}
            >
                {/* Gradient accent bar */}
                <div className={`absolute top-0 left-0 right-0 h-1 bg-gradient-to-r ${net.gradient} ${pinned ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'} transition-opacity duration-300`} />

                <div className="flex items-start justify-between">
                    <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${net.gradient} flex items-center justify-center shadow-lg ${net.shadow} mb-3`}>
                        <net.icon className="w-5 h-5 text-white" />
                    </div>
                    <ChevronRight className="w-4 h-4 text-zinc-700 group-hover:text-zinc-400 group-hover:translate-x-0.5 transition-all" />
                </div>
                <h3 className="font-semibold text-zinc-100 mb-1">{net.name}</h3>
                <p className="text-zinc-500 text-sm leading-snug">{net.desc}</p>
            </button>

            {/* Pin toggle button */}
            <button
                onClick={onTogglePin}
                className={`absolute top-3 right-3 p-1.5 rounded-lg transition-all z-10 ${pinned
                    ? 'bg-indigo-500/20 text-indigo-400 opacity-100'
                    : 'bg-zinc-800/80 text-zinc-600 opacity-0 group-hover:opacity-100 hover:text-zinc-300'
                    }`}
                title={pinned ? 'Unpin network' : 'Pin to top'}
            >
                {pinned ? <PinOff className="w-3.5 h-3.5" /> : <Pin className="w-3.5 h-3.5" />}
            </button>
        </div>
    );
}

// ── Sticky Network Header ────────────────────────────────────────

function StickyNetworkHeader({
    currentNetwork,
    allNetworks,
    onBack,
    onSwitch
}: {
    currentNetwork: NetworkDef;
    allNetworks: NetworkDef[];
    onBack: () => void;
    onSwitch: (networkId: string) => void;
}) {
    return (
        <div className="sticky top-0 z-50 backdrop-blur-xl bg-white/80 dark:bg-zinc-950/80 border-b border-zinc-200 dark:border-zinc-800/50 -mx-4 md:-mx-8 px-4 md:px-8 py-3 mb-6 flex items-center justify-between gap-4">
            <button
                onClick={onBack}
                className="p-2 rounded-full hover:bg-zinc-100 dark:hover:bg-zinc-800/80 text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition-all active:scale-95 border border-transparent hover:border-zinc-200 dark:hover:border-zinc-700/50"
                title="Back to Networks"
            >
                <ArrowLeft className="w-5 h-5" />
            </button>

            <div className="flex-1 flex justify-center">
                <div className="relative group flex items-center gap-2 px-4 py-1.5 rounded-full bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700 transition-colors shadow-sm">
                    <currentNetwork.icon className="w-4 h-4 text-zinc-500 dark:text-zinc-400 group-hover:text-zinc-600 dark:group-hover:text-zinc-300 transition-colors" />
                    <select
                        value={currentNetwork.id}
                        onChange={(e) => onSwitch(e.target.value)}
                        className="appearance-none bg-transparent font-medium text-sm text-zinc-800 dark:text-zinc-200 py-0.5 pr-6 cursor-pointer focus:outline-none text-center min-w-[100px]"
                        style={{ textAlignLast: 'center' }}
                    >
                        {allNetworks.map(n => (
                            <option key={n.id} value={n.id} className="bg-zinc-50 dark:bg-zinc-900 text-zinc-800 dark:text-zinc-300">
                                {n.name}
                            </option>
                        ))}
                    </select>
                    <ChevronDown className="w-3.5 h-3.5 text-zinc-500 absolute right-3 pointer-events-none group-hover:text-zinc-400 transition-colors" />
                </div>
            </div>

            <div className="w-9" /> {/* Spacer to balance Back button */}
        </div>
    );
}

// ── Network Feed View ────────────────────────────────────────────

function NetworkFeed({
    network,
    allNetworks,
    onBack,
    onSwitch
}: {
    network: NetworkDef;
    allNetworks: NetworkDef[];
    onBack: () => void;
    onSwitch: (networkId: string) => void;
}) {
    const { posts, allCount, hasMore, loadMore, loading, error, refetch } = useUnifiedFeed({
        sourceFilter: network.id,
        category: 'all',
    });

    return (
        <div>
            <StickyNetworkHeader
                currentNetwork={network}
                allNetworks={allNetworks}
                onBack={onBack}
                onSwitch={onSwitch}
            />

            <div className="flex items-center gap-4 mb-8 px-2">
                <div className={`w-14 h-14 rounded-2xl bg-gradient-to-br ${network.gradient} flex items-center justify-center shadow-xl ${network.shadow}`}>
                    <network.icon className="w-7 h-7 text-white" />
                </div>
                <div>
                    <h1 className="text-2xl font-bold text-white">{network.name}</h1>
                    <p className="text-zinc-500 text-sm">{network.desc}</p>
                </div>
            </div>

            {loading && (
                <div className="flex flex-col items-center justify-center py-24 gap-3">
                    <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
                    <p className="text-zinc-500 text-sm">Fetching from {network.name}…</p>
                </div>
            )}

            {error && (
                <ErrorRetry message={error} onRetry={refetch} loading={loading} />
            )}

            {!loading && !error && posts.length === 0 && (
                <div className="text-center py-24">
                    <p className="text-zinc-500 mb-4">No posts available from {network.name} right now.</p>
                    <button
                        onClick={refetch}
                        className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-zinc-800 text-zinc-300 hover:bg-zinc-700 hover:text-white transition-all border border-zinc-700"
                    >
                        <RefreshCw className="w-4 h-4" />
                        Retry Now
                    </button>
                </div>
            )}

            <div className="max-w-2xl mx-auto">
                {posts.map(post => (
                    <PostCard key={`${post.source}-${post.id}`} post={post} />
                ))}
                <LoadMoreTrigger
                    hasMore={hasMore}
                    loading={loading}
                    loadMore={loadMore}
                    totalCount={allCount}
                    visibleCount={posts.length}
                />
            </div>
        </div>
    );
}

// ── Main Dashboard ───────────────────────────────────────────────

export function Dashboard() {
    const [selectedNetwork, setSelectedNetwork] = useState<NetworkDef | null>(null);
    const [pinnedIds, setPinnedIds] = useState<string[]>(() => loadPins(polycentricManager.systemKey));

    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        const netId = params.get('network');
        if (netId) {
            const net = NETWORKS.find(n => n.id === netId);
            if (net) setSelectedNetwork(net);
        }
    }, []);

    useEffect(() => {
        const onSync = (e: any) => {
            if (e?.detail?.baseKey !== STORAGE_KEYS.pins) return;
            const id = polycentricManager.systemKey || 'anonymous';
            if (e?.detail?.identity !== id) return;
            setPinnedIds(loadPins(polycentricManager.systemKey));
        };
        window.addEventListener('social-portal-sync', onSync);
        return () => window.removeEventListener('social-portal-sync', onSync);
    }, []);

    const togglePin = useCallback((networkId: string) => {
        setPinnedIds(prev => {
            const next = prev.includes(networkId)
                ? prev.filter(id => id !== networkId)
                : [...prev, networkId];
            savePins(polycentricManager.systemKey, next);
            return next;
        });
    }, []);

    const switchNetwork = useCallback((networkId: string) => {
        const net = NETWORKS.find(n => n.id === networkId);
        if (net) setSelectedNetwork(net);
    }, []);

    if (selectedNetwork) {
        return (
            <NetworkFeed
                network={selectedNetwork}
                allNetworks={NETWORKS}
                onBack={() => setSelectedNetwork(null)}
                onSwitch={switchNetwork}
            />
        );
    }

    const pinnedNetworks = NETWORKS.filter(n => pinnedIds.includes(n.id));
    const unpinnedBySection = SECTIONS.map(section => ({
        ...section,
        networks: NETWORKS.filter(n => n.category === section.key && !pinnedIds.includes(n.id)),
    })).filter(s => s.networks.length > 0);

    return (
        <div>
            <div className="mb-10">
                <h1 className="text-3xl font-bold text-zinc-100">
                    Networks
                </h1>
                <p className="text-zinc-500 mt-1">Choose a network to browse its feed — pin your favorites to the top</p>
            </div>

            {/* Pinned section */}
            {pinnedNetworks.length > 0 && (
                <div className="mb-10">
                    <div className="flex items-center gap-3 mb-4">
                        <Pin className="w-4 h-4 text-indigo-400" />
                        <h2 className="text-lg font-semibold text-zinc-200">Pinned</h2>
                        <span className="text-xs text-zinc-600">Your favorites</span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                        {pinnedNetworks.map(net => (
                            <NetworkCard
                                key={net.id}
                                net={net}
                                pinned={true}
                                onSelect={() => setSelectedNetwork(net)}
                                onTogglePin={(e) => { e.stopPropagation(); togglePin(net.id); }}
                            />
                        ))}
                    </div>
                </div>
            )}

            {/* Category sections (only unpinned networks) */}
            {unpinnedBySection.map(section => (
                <div key={section.key} className="mb-10">
                    <div className="flex items-center gap-3 mb-4">
                        <h2 className="text-lg font-semibold text-zinc-200">{section.label}</h2>
                        <span className="text-xs text-zinc-600">{section.desc}</span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                        {section.networks.map(net => (
                            <NetworkCard
                                key={net.id}
                                net={net}
                                pinned={false}
                                onSelect={() => setSelectedNetwork(net)}
                                onTogglePin={(e) => { e.stopPropagation(); togglePin(net.id); }}
                            />
                        ))}
                    </div>
                </div>
            ))}
        </div>
    );
}
