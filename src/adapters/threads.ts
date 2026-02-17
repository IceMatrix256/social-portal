import type { FeedAdapter, UnifiedPost } from "./types";
import { fetchProxyContent } from "../lib/proxy";
import { polycentricManager } from "../lib/polycentric/manager";
import { loadSyncedJSON, STORAGE_KEYS } from "../lib/sync";

// Curated list for the default "trending" mode (no controversial/CEO accounts).
// NOTE: Threads is increasingly login-gated; this list is chosen to have at least a few
// profiles that are fetchable without authentication in this environment.
const DEFAULT_TRENDING_HANDLES = ["natgeo", "glaad", "humanrightscampaign", "itgetsbetter", "lgbt", "georgetakei"];
const BLOCKED_HANDLES = new Set(["zuck", "markzuckerberg", "meta", "elon", "musk", "elonmusk"]);

function normalizeHandle(raw: string): string {
  return raw.trim().replace(/^@/, "").toLowerCase();
}

function getTrendingHandles(): string[] {
  const identity = polycentricManager.systemKey || "anonymous";
  const configured = loadSyncedJSON<string[]>(
    STORAGE_KEYS.threadsTrendingHandles,
    identity,
    DEFAULT_TRENDING_HANDLES
  );
  const unique: string[] = [];
  const seen = new Set<string>();
  for (const h of configured.map(normalizeHandle)) {
    if (!h) continue;
    if (BLOCKED_HANDLES.has(h)) continue;
    if (seen.has(h)) continue;
    seen.add(h);
    unique.push(h);
  }
  return unique.length > 0 ? unique : DEFAULT_TRENDING_HANDLES.filter((h) => !BLOCKED_HANDLES.has(h));
}

function isCounterLine(line: string): boolean {
  const trimmed = line.trim();
  return /^(\d+(\.\d+)?)([KMB])?$/.test(trimmed);
}

function extractImageUrls(block: string): string[] {
  const urls: string[] = [];
  const seen = new Set<string>();
  const re = /\((https:\/\/scontent-[^)]+\.(?:jpg|jpeg|png|webp)[^)]+)\)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(block)) !== null) {
    const url = m[1];
    if (url && !seen.has(url)) {
      seen.add(url);
      urls.push(url);
    }
  }
  return urls;
}

function pickAvatarUrl(imageUrls: string[]): string {
  // Profile pics are typically instagram CDN "t51.2885-19" paths.
  return imageUrls.find((u) => u.includes("/t51.2885-19/")) || imageUrls[0] || "";
}

function pickMediaUrls(imageUrls: string[], avatarUrl: string): string[] {
  return imageUrls.filter((u) => u !== avatarUrl).slice(0, 4);
}

function isLoginGated(markdown: string): boolean {
  return (
    markdown.includes("Threads • Log in") ||
    markdown.includes("Log in with your Instagram account") ||
    markdown.toLowerCase().includes("scan to get the app")
  );
}

function hashString(input: string): string {
  // djb2-ish: stable, fast, good enough for local IDs.
  let h = 5381;
  for (let i = 0; i < input.length; i++) h = ((h << 5) + h) ^ input.charCodeAt(i);
  return (h >>> 0).toString(16);
}

function parseProfileMarkdown(handle: string, markdown: string): UnifiedPost[] {
  if (isLoginGated(markdown)) return [];

  // Post blocks tend to start with a profile link: (...)](https://www.threads.com/@<handle>)
  const startRe = /\]\(https:\/\/www\.threads\.com\/@([A-Za-z0-9._-]+)\)/g;
  const starts: Array<{ index: number; author: string }> = [];
  let m: RegExpExecArray | null;
  while ((m = startRe.exec(markdown)) !== null) {
    starts.push({ index: m.index, author: m[1] });
  }
  if (starts.length === 0) return [];

  const posts: UnifiedPost[] = [];
  for (let i = 0; i < starts.length; i++) {
    const cur = starts[i];
    const nextIndex = i + 1 < starts.length ? starts[i + 1].index : markdown.length;
    const block = markdown.slice(cur.index, nextIndex);

    const postUrlMatch = block.match(/https:\/\/www\.threads\.(?:com|net)\/@[^/]+\/post\/([A-Za-z0-9_-]+)/);
    const postUrl = postUrlMatch ? postUrlMatch[0] : `https://www.threads.com/@${cur.author}`;
    const postId = postUrlMatch ? postUrlMatch[1] : `p-${hashString(`${cur.author}:${block.slice(0, 240)}`)}`;

    const lines = block
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.length > 0);

    const contentLines: string[] = [];
    for (const line of lines) {
      if (line.includes("https://www.threads.com/@" + cur.author)) continue;
      if (line === cur.author) continue;
      if (line === "Follow" || line === "Mention" || line === "·") continue;
      if (line.startsWith("![Image")) continue;
      if (line.startsWith("[![Image")) continue;
      if (isCounterLine(line)) break;
      contentLines.push(line);
      if (contentLines.length >= 4) break;
    }

    const content = contentLines.join(" ").trim();
    const imageUrls = extractImageUrls(block);
    const avatarUrl = pickAvatarUrl(imageUrls) || `https://api.dicebear.com/7.x/identicon/svg?seed=${cur.author}`;
    const mediaUrls = pickMediaUrls(imageUrls, avatarUrl);

    if (!content && mediaUrls.length === 0) continue;

    posts.push({
      id: postId,
      source: "threads",
      author: {
        name: cur.author,
        handle: `@${cur.author}`,
        avatar: avatarUrl,
        url: `https://www.threads.com/@${cur.author}`,
      },
      content: content || "",
      media: mediaUrls.map((url) => ({ type: "image", url })),
      url: postUrl,
      timestamp: Date.now() - i * 1000,
      originalData: { handle, block },
    });
  }

  return posts;
}

export class ThreadsAdapter implements FeedAdapter {
  name = "Threads";
  description = "Threads public profiles (curated trending)";
  private modeOrHandle: string;

  constructor(modeOrHandle: string = "trending") {
    this.modeOrHandle = modeOrHandle;
  }

  async fetchPosts(topic?: string): Promise<UnifiedPost[]> {
    const q = (topic || this.modeOrHandle || "trending").trim();
    const handles = q.toLowerCase() === "trending" ? getTrendingHandles() : [normalizeHandle(q)];

    const all = await Promise.all(
      handles.map(async (handle) => {
        try {
          const url = `https://r.jina.ai/http://https://www.threads.net/@${encodeURIComponent(handle)}`;
          const markdown = await fetchProxyContent(url, { headers: { Accept: "text/plain" } });
          return parseProfileMarkdown(handle, markdown);
        } catch (e) {
          console.warn("[threads] failed to fetch", handle, e);
          return [];
        }
      })
    );

    // Merge + sort newest-ish first
    return all.flat().sort((a, b) => b.timestamp - a.timestamp);
  }
}
