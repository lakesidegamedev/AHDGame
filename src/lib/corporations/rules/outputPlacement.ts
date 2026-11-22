/**
 * Where a sector's output went, as three separate shares of what it made:
 * sold to outside buyers, delivered to the company's own sites, and truly
 * unsold. Output sent to the company's own sites is used, never unsold, so
 * every "sold %" and "unsold" figure and every build warning reads from here.
 */
export interface OutputPlacement {
  /** Share sold to outside buyers, 0-1. */
  sold: number;
  /** Share delivered to the company's own sites, 0-1. */
  ownSites: number;
  /** Share nobody took, 0-1. */
  unsold: number;
}

const clamp01 = (x: number) => (Number.isFinite(x) ? Math.max(0, Math.min(1, x)) : 0);

/**
 * `sold` and `ownSites` are shares of output made. Their sum is capped at 1;
 * the remainder is unsold. Returns null when the sold share is not known.
 */
export function outputPlacement(input: {
  sold: number | null | undefined;
  ownSites?: number | null;
}): OutputPlacement | null {
  if (input.sold == null || !Number.isFinite(input.sold)) return null;
  const sold = clamp01(input.sold);
  const ownSites = Math.min(clamp01(input.ownSites ?? 0), 1 - sold);
  const unsold = 1 - sold - ownSites;
  return { sold, ownSites, unsold: unsold > 1e-9 ? unsold : 0 };
}

/** Whole-number percents that always add to 100. */
export function placementPercents(p: OutputPlacement): {
  sold: number;
  ownSites: number;
  unsold: number;
} {
  const sold = Math.round(p.sold * 100);
  const ownSites = Math.round(p.ownSites * 100);
  return { sold, ownSites, unsold: Math.max(0, 100 - sold - ownSites) };
}

/** Plain words for the three shares. Own-site share is left out when zero. */
export function placementSentence(p: OutputPlacement): string {
  const pct = placementPercents(p);
  const own = pct.ownSites > 0 ? `, ${pct.ownSites}% sent to your own sites` : "";
  return `${pct.sold}% sold to buyers${own}, ${pct.unsold}% unsold`;
}

/** Unsold share above which a sector makes more than anyone takes. */
export const OVERSUPPLIED_UNSOLD = 0.15;
