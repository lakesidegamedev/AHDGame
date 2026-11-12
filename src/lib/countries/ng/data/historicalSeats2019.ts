import type { HistoricalSeat } from "@/lib/seats/historicalSeat";

// ─── Nigeria: zone governors (one per geopolitical zone). Like JP, only the
// executive seats are seeded historically; the National Assembly fills via
// elections. Party per zone follows the dominant party in ngRegionVoteShares.
export const NG_GOVERNORS_2019: HistoricalSeat[] = [
  { state: "NORTH_WEST", officeType: "governor", party: "ng_apc" },
  { state: "NORTH_EAST", officeType: "governor", party: "ng_apc" },
  { state: "NORTH_CENTRAL", officeType: "governor", party: "ng_apc" },
  { state: "SOUTH_WEST", officeType: "governor", party: "ng_apc" },
  { state: "SOUTH_SOUTH", officeType: "governor", party: "ng_pdp" },
  { state: "SOUTH_EAST", officeType: "governor", party: "ng_apga" },
];
