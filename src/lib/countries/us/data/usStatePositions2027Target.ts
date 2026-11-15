import { ELECTION_2024_MARGIN } from "@/lib/data/2024ElectionResults";

/**
 * Economic lean per point of 2024 Republican presidential margin. Matches the
 * spread of the 2020-calibrated 2019 surface (Wyoming +43 at about +1.4).
 */
export const LEAN_PER_MARGIN_POINT = 0.033;

/** Target 2027 opening economic lean for a US state, from its 2024 margin. */
export function usOpeningLeanTarget2027(stateId: string): number | null {
  const demMargin = ELECTION_2024_MARGIN[stateId];
  return demMargin === undefined ? null : -demMargin * LEAN_PER_MARGIN_POINT;
}
