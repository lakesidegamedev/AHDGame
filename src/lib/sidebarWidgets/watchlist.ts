/**
 * Watchlist widget (experimental): things a player starred to follow, saved on
 * the account. Each item is a kind plus an id: a corporation by sequential id,
 * or a commodity by its type.
 */
import { COMMODITY_TYPES } from "@/lib/constants/commoditiesCore";

export const WATCH_KINDS = ["corporation", "commodity"] as const;
export type WatchKind = (typeof WATCH_KINDS)[number];

export interface WatchItem {
  kind: WatchKind;
  id: string;
}

export const MAX_WATCHLIST = 20;

export const WATCH_ID_PATTERNS: Record<WatchKind, RegExp> = {
  corporation: /^[1-9][0-9]{0,8}$/,
  commodity: /^[a-z_]{1,32}$/,
};

const COMMODITIES = new Set<string>(COMMODITY_TYPES);

export function isWatchItem(value: unknown): value is WatchItem {
  if (!value || typeof value !== "object") return false;
  const { kind, id } = value as { kind?: unknown; id?: unknown };
  if (typeof kind !== "string" || typeof id !== "string") return false;
  if (!(WATCH_KINDS as readonly string[]).includes(kind)) return false;
  if (!WATCH_ID_PATTERNS[kind as WatchKind].test(id)) return false;
  return kind !== "commodity" || COMMODITIES.has(id);
}

export function sameWatchItem(a: WatchItem, b: WatchItem): boolean {
  return a.kind === b.kind && a.id === b.id;
}

/** Saved watchlist, cleaned of invalid and repeated items and capped. */
export function widgetWatchlist(value: unknown): WatchItem[] {
  if (!Array.isArray(value)) return [];
  const list: WatchItem[] = [];
  for (const item of value) {
    if (!isWatchItem(item) || list.some((kept) => sameWatchItem(kept, item))) continue;
    list.push({ kind: item.kind, id: item.id });
    if (list.length === MAX_WATCHLIST) break;
  }
  return list;
}
