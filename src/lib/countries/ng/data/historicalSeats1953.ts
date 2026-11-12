import type { HistoricalSeat } from "@/lib/seats/historicalSeat";

// 1953 late-colonial: map the three Regional Premiers onto the 6-zone grid.
// Northern Region (Bello / NPC) → NW/NE/NC; Western (Awolowo / AG) → SW;
// Eastern (Azikiwe / NCNC) → SE/SS. Nigeria had no zone governors in 1953 —
// these are the engine's sub-national executive seats standing in for regional
// party control under Macpherson/Lyttelton.
export const NG_GOVERNORS_1953: HistoricalSeat[] = [
  { state: "NORTH_WEST", officeType: "governor", party: "ng_npc" },
  { state: "NORTH_EAST", officeType: "governor", party: "ng_npc" },
  { state: "NORTH_CENTRAL", officeType: "governor", party: "ng_npc" },
  { state: "SOUTH_WEST", officeType: "governor", party: "ng_ag" },
  { state: "SOUTH_SOUTH", officeType: "governor", party: "ng_ncnc" },
  { state: "SOUTH_EAST", officeType: "governor", party: "ng_ncnc" },
];
