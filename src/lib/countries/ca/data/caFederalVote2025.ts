/**
 * April 2025 Canadian federal election, popular vote share by province and
 * territory (Liberal, Conservative, NDP, Bloc Québécois), in percent.
 */
export const CA_FEDERAL_VOTE_2025: Record<
  string,
  { lpc: number; cpc: number; ndp: number; bq: number }
> = {
  CA_NL: { lpc: 54.0, cpc: 39.7, ndp: 5.5, bq: 0 },
  CA_PE: { lpc: 57.5, cpc: 36.9, ndp: 2.5, bq: 0 },
  CA_NS: { lpc: 57.2, cpc: 35.2, ndp: 5.2, bq: 0 },
  CA_NB: { lpc: 53.4, cpc: 40.8, ndp: 2.9, bq: 0 },
  CA_QC: { lpc: 42.6, cpc: 23.3, ndp: 4.5, bq: 27.7 },
  CA_ON: { lpc: 49.0, cpc: 43.8, ndp: 4.9, bq: 0 },
  CA_MB: { lpc: 40.8, cpc: 46.3, ndp: 11.0, bq: 0 },
  CA_SK: { lpc: 26.6, cpc: 64.6, ndp: 7.6, bq: 0 },
  CA_AB: { lpc: 27.9, cpc: 63.5, ndp: 6.3, bq: 0 },
  CA_BC: { lpc: 41.8, cpc: 41.0, ndp: 13.0, bq: 0 },
  CA_YT: { lpc: 53.1, cpc: 38.5, ndp: 6.3, bq: 0 },
  CA_NT: { lpc: 53.5, cpc: 33.3, ndp: 12.2, bq: 0 },
  CA_NU: { lpc: 36.7, cpc: 26.0, ndp: 37.3, bq: 0 },
};

/** Lean per point of Conservative-over-Liberal margin (same scale as the US). */
export const CA_LEAN_PER_MARGIN_POINT = 0.033;

/**
 * Even split between the Liberal (-1, -2) and Conservative (+3, +1) platforms
 * on each axis: the midpoint of the two parties.
 */
export const CA_EVEN_SPLIT = { economicLean: 1, socialLean: -0.5 } as const;

/** Target 2027 opening lean for a province or territory from its 2025 vote. */
export function caOpeningLeanTarget2027(
  regionId: string
): { economicLean: number; socialLean: number } | null {
  const vote = CA_FEDERAL_VOTE_2025[regionId];
  if (!vote) return null;
  const shift = (vote.cpc - vote.lpc) * CA_LEAN_PER_MARGIN_POINT;
  return {
    economicLean: CA_EVEN_SPLIT.economicLean + shift,
    socialLean: CA_EVEN_SPLIT.socialLean + shift,
  };
}
