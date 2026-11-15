/**
 * Per-Land canonical anchors for DE Landtag elections, one table per seeded
 * era. Use getLandtagAnchor() rather than reading a table directly.
 *
 * 2019-default: turn 1 = Feb 2020; 48 turns/year.
 * 1991-default: turn 1 = Jan 1991; values are months from Jan 1991 × 4,
 *   rounded to the nearest real-world election year; period 240 turns.
 *
 * Uses internal IDs (Bremen is `BRE` to avoid the CN-Huabei `HB` collision;
 * the displayed map label is still "HB").
 */

/** 2019-default: cycle-1 end turns (turn 1 = Feb 2020). */
export const LANDTAG_CYCLE1_END_TURN_BY_LAND: Record<string, number> = {
  BW: 288, // 2026
  BY: 384, // 2028
  BE: 288, // 2026
  BB: 432, // 2029
  BRE: 336, // 2027
  HH: 480, // 2030
  HE: 384, // 2028
  MV: 288, // 2026
  NI: 336, // 2027
  NW: 336, // 2027
  RP: 288, // 2026
  SL: 336, // 2027
  SN: 432, // 2029
  ST: 288, // 2026
  SH: 336, // 2027
  TH: 432, // 2029
};

/** 1991-default: cycle-1 end turns (turn 1 = Jan 1991). */
export const LANDTAG_CYCLE1_END_TURN_BY_LAND_1991: Record<string, number> = {
  BW: 60, // Apr 1992 (~15 mo)
  BY: 176, // Sep 1994 (~44 mo)
  BE: 228, // Oct 1995 (~57 mo)
  BB: 176, // Sep 1994 (~44 mo)
  BRE: 32, // Sep 1991 (~8 mo)
  HH: 20, // Jun 1991 (~5 mo)
  HE: 196, // Feb 1995 (~49 mo)
  MV: 180, // Oct 1994 (~45 mo)
  NI: 152, // Mar 1994 (~38 mo)
  NW: 208, // May 1995 (~52 mo)
  RP: 12, // Apr 1991 (~3 mo)
  SL: 180, // Oct 1994 (~45 mo)
  SN: 176, // Sep 1994 (~44 mo)
  ST: 164, // Jun 1994 (~41 mo)
  SH: 60, // Apr 1992 (~15 mo)
  TH: 180, // Oct 1994 (~45 mo)
};

/**
 * Return the cycle-1 end turn for a Bundesland under the given preset.
 * Returns undefined for unknown Land IDs (spawner silently skips them).
 */
export function getLandtagAnchor(land: string, preset: string): number | undefined {
  if (preset === "1991-default") return LANDTAG_CYCLE1_END_TURN_BY_LAND_1991[land];
  return LANDTAG_CYCLE1_END_TURN_BY_LAND[land];
}
