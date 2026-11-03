import {
  FILL_RATE_BAND_LABEL,
  FILL_RATE_BAND_SHORT,
  type FillRateBand,
} from "@/lib/corporations/financialFogOfWar";

/**
 * Fill-band presentation helpers. Kept apart from `plantsPresentation` so
 * dense table primitives can format a fill rate without pulling the plant,
 * freight and commodity catalogues into their chunk.
 */

/** Fill rate as a whole-percent string. "n/a" when there is no fill rate. */
export function formatFillPercent(fill: number | null | undefined): string {
  if (fill == null || !Number.isFinite(fill)) return "n/a";
  return `${Math.round(fill * 100)}%`;
}

/**
 * Text colour per fill band.
 *
 * This is where the surface spends its colour: across twenty rows the band is
 * the only thing a CEO needs to scan to find the plant that is making things
 * nobody is buying. Everything else on the row stays neutral so this reads.
 */
export const FILL_BAND_TEXT: Record<FillRateBand, string> = {
  high: "text-success",
  medium: "text-warning",
  low: "text-error",
};

/** Explanatory sentence for a band, for tooltips and the rival view. */
export function fillBandSentence(band: FillRateBand): string {
  return FILL_RATE_BAND_LABEL[band];
}

/** Short band word for a chip that has no room for a number. */
export function fillBandShort(band: FillRateBand): string {
  return FILL_RATE_BAND_SHORT[band];
}
