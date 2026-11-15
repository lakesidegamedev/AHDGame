import type { WikiSearchCandidate } from "@/lib/wiki/wikiSearch";

export const DOCS_SITE_URL = "https://docs.lakesidegames.net";
const DOCS_INDEX_URL = `${DOCS_SITE_URL}/search-index.json`;
const CACHE_TTL_MS = 60 * 60 * 1000;
const RETRY_AFTER_FAILURE_MS = 60 * 1000;
const FETCH_TIMEOUT_MS = 2000;

/** One entry in the docs site search index. */
export interface DocsIndexItem {
  h: string;
  t: string;
  d?: string;
  s?: string;
  tx?: string;
}

/** Keeps only well-formed entries so a bad index cannot break wiki search. */
export function parseDocsIndex(raw: unknown): DocsIndexItem[] {
  if (!Array.isArray(raw)) return [];
  const items: DocsIndexItem[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const e = entry as Record<string, unknown>;
    if (typeof e.h !== "string" || typeof e.t !== "string" || !e.h.startsWith("/")) continue;
    items.push({
      h: e.h,
      t: e.t,
      d: typeof e.d === "string" ? e.d : undefined,
      s: typeof e.s === "string" ? e.s : undefined,
      tx: typeof e.tx === "string" ? e.tx : undefined,
    });
  }
  return items;
}

/**
 * Turns index items into rankable candidates. Items are prefiltered on the raw
 * query (or a fuzzy-eligible word) so the ranker only sees plausible hits.
 */
export function docsItemsToCandidates(
  items: DocsIndexItem[],
  query: string
): WikiSearchCandidate[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return items.map((item) => ({
    slug: item.h,
    title: item.t,
    description: item.d || item.s,
    href: `${DOCS_SITE_URL}${item.h}`,
    kind: "docs" as const,
    matchedBody: (item.tx ?? "").toLowerCase().includes(q),
  }));
}

let cache: { at: number; items: DocsIndexItem[] } | null = null;
let lastFailureAt = 0;

/** Test hook: drop the in-memory index. */
export function resetDocsIndexCache(): void {
  cache = null;
  lastFailureAt = 0;
}

/** Docs index, cached for an hour. Never throws; returns stale or empty data on failure. */
export async function getDocsIndex(): Promise<DocsIndexItem[]> {
  const now = Date.now();
  if (cache && now - cache.at < CACHE_TTL_MS) return cache.items;
  if (now - lastFailureAt < RETRY_AFTER_FAILURE_MS) return cache?.items ?? [];

  try {
    const res = await fetch(DOCS_INDEX_URL, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    if (!res.ok) throw new Error(`docs index ${res.status}`);
    const items = parseDocsIndex(await res.json());
    cache = { at: now, items };
    return items;
  } catch {
    lastFailureAt = now;
    return cache?.items ?? [];
  }
}
