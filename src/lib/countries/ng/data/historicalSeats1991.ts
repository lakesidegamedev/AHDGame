import type { HistoricalSeat } from "@/lib/seats/historicalSeat";

// 1991 Third Republic: SDP dominant in SW/NC/SS; NRC in NW/NE/SE.
export const NG_GOVERNORS_1991: HistoricalSeat[] = [
  { state: "NORTH_WEST", officeType: "governor", party: "ng_nrc" },
  { state: "NORTH_EAST", officeType: "governor", party: "ng_nrc" },
  { state: "NORTH_CENTRAL", officeType: "governor", party: "ng_sdp" },
  { state: "SOUTH_WEST", officeType: "governor", party: "ng_sdp" },
  { state: "SOUTH_SOUTH", officeType: "governor", party: "ng_sdp" },
  { state: "SOUTH_EAST", officeType: "governor", party: "ng_nrc" },
];
