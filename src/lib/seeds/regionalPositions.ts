import type { DemographicTurnoutRates } from "./demographicCategories";

/**
 * Regional authoring helpers for the era electorate tables.
 *
 * Pre-2019 US anchors are authored at REGION level and applied to every state
 * in the region; single-state exceptions are expressed as a SHIFT off that
 * table rather than bespoke state tables.
 *
 * Shifts are not uniform across buckets. `REGIONAL_SIGNATURE` gives how
 * strongly each Layer-1 bucket carries a region's political signature:
 * `race.white` moves fully, education and wealth move most of the way, and
 * nationally anchored buckets (minority races, the poor, ideological poles)
 * barely move, since a Black voter in Vermont and one in Mississippi did not
 * differ by their white neighbours' distance.
 */

/** `[dimension, key, economicLean, socialLean]` — the shape both era tables use. */
export type PositionEntry = [keyof DemographicTurnoutRates, string, number, number];

/** Nested `dim -> key -> position` form used by the census files' `positions` blocks. */
export type PositionsBlock = Record<
  string,
  Record<string, { economicLean: number; socialLean: number }>
>;

/**
 * Share of a regional shift each bucket absorbs. 1.0 = the bucket carries the
 * region's signature in full; 0.2 = the bucket is essentially national.
 */
export const REGIONAL_SIGNATURE: Record<string, number> = {
  "race.white": 1, // the plurality, high-turnout group: the region's signature in full
  "education.no_college": 0.8, // regional economies differ most in what non-graduates do
  "wealth.middle": 0.8, // the suburban/Main Street middle is regionally coded
  "ideology.evangelicals": 0.7, // the same faith means different politics by region
  "ideology.patriots": 0.7,
  "ideology.gunowners": 0.7,
  "education.college": 0.6,
  "wealth.high": 0.6, // capital is regional but tracks national markets
  "ideology.libertarians": 0.4,
  "education.graduate": 0.4, // the graduate stratum is the most nationally uniform
  "wealth.low": 0.3, // poverty politics vary less by region than middle-class politics
  "ideology.progressives": 0.3,
  "ideology.environmentalists": 0.3,
  "race.black": 0.2, // nationally anchored: see the module doc
  "race.hispanic": 0.2,
};

const clamp = (v: number): number => Math.max(-5, Math.min(5, Math.round(v * 10) / 10));

/** Shift a regional entry table by (econ, social), weighted by `REGIONAL_SIGNATURE`. */
export function shiftRegion(
  base: readonly PositionEntry[],
  dEcon: number,
  dSocial: number
): PositionEntry[] {
  return base.map(([dim, key, econ, social]) => {
    const w = REGIONAL_SIGNATURE[`${dim}.${key}`] ?? 0;
    return [dim, key, clamp(econ + dEcon * w), clamp(social + dSocial * w)] as PositionEntry;
  });
}

/** Same shift, for the nested `positions` blocks the census files carry. */
export function shiftRegionPositions(
  base: PositionsBlock,
  dEcon: number,
  dSocial: number
): PositionsBlock {
  const out: PositionsBlock = {};
  for (const [dim, keys] of Object.entries(base)) {
    out[dim] = {};
    for (const [key, pos] of Object.entries(keys)) {
      const w = REGIONAL_SIGNATURE[`${dim}.${key}`] ?? 0;
      out[dim][key] = {
        economicLean: clamp(pos.economicLean + dEcon * w),
        socialLean: clamp(pos.socialLean + dSocial * w),
      };
    }
  }
  return out;
}
