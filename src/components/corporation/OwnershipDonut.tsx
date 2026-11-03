"use client";

import { brandShades, resolveCorpColor } from "@/lib/corporations/brandColor";
import type { CorporationDetail } from "./CorporationPageTypes";

/** Named wedges before the tail collapses into one. More is unreadable on a phone. */
const MAX_NAMED = 6;
const FLOAT_COLOR = "hsl(220, 9%, 62%)";

type Shareholder = CorporationDetail["shareholders"][number];

export interface DonutSlice {
  key: string;
  label: string;
  shares: number;
  pct: number;
  color: string;
  href: string | null;
  isYou: boolean;
}

/**
 * Ranked holders to donut slices: the top few named, the tail totalled into
 * one wedge, and shares still sitting on the market as a neutral grey wedge.
 */
export function buildOwnershipSlices(
  corporation: CorporationDetail,
  holderHref: (sh: Shareholder) => string | null,
  myCharacterId: string | null
): DonutSlice[] {
  const total = corporation.totalShares;
  if (!(total > 0)) return [];
  const ranked = (corporation.shareholders ?? [])
    .filter((sh) => sh.shares > 0)
    .sort((a, b) => b.shares - a.shares);
  const head = ranked.slice(0, MAX_NAMED);
  const tail = ranked.slice(MAX_NAMED);
  const shades = brandShades(
    resolveCorpColor(corporation.brandColor, corporation._id),
    head.length + (tail.length > 0 ? 1 : 0)
  );

  const slices: DonutSlice[] = head.map((sh, i) => ({
    key: `${sh.characterId ?? sh.corporationId ?? sh.name}`,
    label: sh.name,
    shares: sh.shares,
    pct: (sh.shares / total) * 100,
    color: shades[i],
    href: holderHref(sh),
    isYou: myCharacterId != null && sh.characterId === myCharacterId,
  }));

  if (tail.length > 0) {
    const tailShares = tail.reduce((sum, sh) => sum + sh.shares, 0);
    slices.push({
      key: "tail",
      label: `${tail.length} smaller holder${tail.length === 1 ? "" : "s"}`,
      shares: tailShares,
      pct: (tailShares / total) * 100,
      color: shades[head.length],
      href: null,
      isYou: false,
    });
  }

  const held = ranked.reduce((sum, sh) => sum + sh.shares, 0);
  const onMarket = Math.max(0, total - held);
  if (onMarket / total >= 0.001) {
    slices.push({
      key: "market",
      label: "On the market",
      shares: onMarket,
      pct: (onMarket / total) * 100,
      color: FLOAT_COLOR,
      href: null,
      isYou: false,
    });
  }
  return slices;
}
