import type { HistoricalSeat } from "@/lib/seats/historicalSeat";

// IE 33rd Dáil — 2020 General Election distribution scaled to the game's
// 160-seat model. National party totals: FF 38, FG 35, SF 37, Lab 6, Green 12,
// Ind (incl. SocDems, PBP-Solidarity, Aontú, others) 32. Per-region seats
// match the canonical `ieRegions[*].houseDistricts` (49 / 21 / 11 / 13 / 15 /
// 20 / 15 / 16). Used by the 2019-default reset preset; this is the
// "modern" counterpart to IE_DAIL_1991 (28th Dáil, 1989-1992).
export const IE_DAIL_2020: HistoricalSeat[] = [
  // Dublin (DUB): 49 seats — SF, Green, and Independent share is highest here.
  { state: "DUB", officeType: "dail", party: "ie_sf", seatsHeld: 14 },
  { state: "DUB", officeType: "dail", party: "ie_ff", seatsHeld: 9 },
  { state: "DUB", officeType: "dail", party: "ie_fg", seatsHeld: 10 },
  { state: "DUB", officeType: "dail", party: "ie_green", seatsHeld: 4 },
  { state: "DUB", officeType: "dail", party: "ie_labour", seatsHeld: 3 },
  { state: "DUB", officeType: "dail", party: "ie_ind", seatsHeld: 9 },

  // Kildare (KIL): 21 seats — three-way FF/FG/SF balance.
  { state: "KIL", officeType: "dail", party: "ie_sf", seatsHeld: 4 },
  { state: "KIL", officeType: "dail", party: "ie_ff", seatsHeld: 5 },
  { state: "KIL", officeType: "dail", party: "ie_fg", seatsHeld: 5 },
  { state: "KIL", officeType: "dail", party: "ie_green", seatsHeld: 2 },
  { state: "KIL", officeType: "dail", party: "ie_labour", seatsHeld: 1 },
  { state: "KIL", officeType: "dail", party: "ie_ind", seatsHeld: 4 },

  // Midlands (MID): 11 seats — rural FF/FG dominance, fewer Greens.
  { state: "MID", officeType: "dail", party: "ie_sf", seatsHeld: 2 },
  { state: "MID", officeType: "dail", party: "ie_ff", seatsHeld: 3 },
  { state: "MID", officeType: "dail", party: "ie_fg", seatsHeld: 3 },
  { state: "MID", officeType: "dail", party: "ie_labour", seatsHeld: 1 },
  { state: "MID", officeType: "dail", party: "ie_ind", seatsHeld: 2 },

  // Wexford (WEX): 13 seats.
  { state: "WEX", officeType: "dail", party: "ie_sf", seatsHeld: 3 },
  { state: "WEX", officeType: "dail", party: "ie_ff", seatsHeld: 3 },
  { state: "WEX", officeType: "dail", party: "ie_fg", seatsHeld: 3 },
  { state: "WEX", officeType: "dail", party: "ie_green", seatsHeld: 1 },
  { state: "WEX", officeType: "dail", party: "ie_ind", seatsHeld: 3 },

  // Limerick (LIM): 15 seats.
  { state: "LIM", officeType: "dail", party: "ie_sf", seatsHeld: 4 },
  { state: "LIM", officeType: "dail", party: "ie_ff", seatsHeld: 4 },
  { state: "LIM", officeType: "dail", party: "ie_fg", seatsHeld: 3 },
  { state: "LIM", officeType: "dail", party: "ie_green", seatsHeld: 1 },
  { state: "LIM", officeType: "dail", party: "ie_ind", seatsHeld: 3 },

  // Cork (COR): 20 seats — Cork is an FG/FF stronghold; Kerry brings Independents.
  { state: "COR", officeType: "dail", party: "ie_sf", seatsHeld: 4 },
  { state: "COR", officeType: "dail", party: "ie_ff", seatsHeld: 5 },
  { state: "COR", officeType: "dail", party: "ie_fg", seatsHeld: 5 },
  { state: "COR", officeType: "dail", party: "ie_green", seatsHeld: 1 },
  { state: "COR", officeType: "dail", party: "ie_labour", seatsHeld: 1 },
  { state: "COR", officeType: "dail", party: "ie_ind", seatsHeld: 4 },

  // Galway (GAL): 15 seats — Galway/Mayo with strong FF/FG and Independents.
  { state: "GAL", officeType: "dail", party: "ie_sf", seatsHeld: 3 },
  { state: "GAL", officeType: "dail", party: "ie_ff", seatsHeld: 4 },
  { state: "GAL", officeType: "dail", party: "ie_fg", seatsHeld: 4 },
  { state: "GAL", officeType: "dail", party: "ie_green", seatsHeld: 1 },
  { state: "GAL", officeType: "dail", party: "ie_ind", seatsHeld: 3 },

  // Donegal (DON): 16 seats — SF stronghold (Donegal / Cavan-Monaghan).
  { state: "DON", officeType: "dail", party: "ie_sf", seatsHeld: 3 },
  { state: "DON", officeType: "dail", party: "ie_ff", seatsHeld: 5 },
  { state: "DON", officeType: "dail", party: "ie_fg", seatsHeld: 2 },
  { state: "DON", officeType: "dail", party: "ie_green", seatsHeld: 2 },
  { state: "DON", officeType: "dail", party: "ie_ind", seatsHeld: 4 },
];

// ─── IE Seanad: 26th Seanad (post-Mar 2020 election) ─────────────────────────
// 60 seats total. The real Seanad is elected via five vocational panels +
// university constituencies + 11 Taoiseach-nominated members; the game
// collapses that complexity into per-region multi-seat offices keyed off
// the `stateSenateSeats` count on each `ieRegions[*]` entry (DUB 9, KIL 8,
// MID 7, WEX 7, LIM 7, COR 8, GAL 7, DON 7 → 60).
//
// Composition post-Apr 2020 Seanad election under Taoiseach Martin (FF/FG/Green
// coalition): national totals FF 18, FG 18, SF 5, Green 4, Lab 3, Ind 12.
// Distributed roughly by regional party strength; the 11 Taoiseach-nominated
// independents fold into the Independent column. `ie_ind` matches the IE_DAIL_2020
// usage (collapses to the canonical "Independent" via INDEPENDENT_SLUGS).
export const IE_SEANAD_2020: HistoricalSeat[] = [
  // Dublin (DUB): 9 seats — Greens + SF concentrated here; coalition Taoiseach
  // nominees boost the Ind column.
  { state: "DUB", officeType: "seanad", party: "ie_ff", seatsHeld: 1 },
  { state: "DUB", officeType: "seanad", party: "ie_fg", seatsHeld: 2 },
  { state: "DUB", officeType: "seanad", party: "ie_sf", seatsHeld: 1 },
  { state: "DUB", officeType: "seanad", party: "ie_green", seatsHeld: 2 },
  { state: "DUB", officeType: "seanad", party: "ie_labour", seatsHeld: 1 },
  { state: "DUB", officeType: "seanad", party: "ie_ind", seatsHeld: 2 },

  // Kildare (KIL): 8 seats — commuter belt, FF/FG split with a Green.
  { state: "KIL", officeType: "seanad", party: "ie_ff", seatsHeld: 3 },
  { state: "KIL", officeType: "seanad", party: "ie_fg", seatsHeld: 3 },
  { state: "KIL", officeType: "seanad", party: "ie_green", seatsHeld: 1 },
  { state: "KIL", officeType: "seanad", party: "ie_ind", seatsHeld: 1 },

  // Midlands (MID): 7 seats — rural FF/FG dominance.
  { state: "MID", officeType: "seanad", party: "ie_ff", seatsHeld: 2 },
  { state: "MID", officeType: "seanad", party: "ie_fg", seatsHeld: 3 },
  { state: "MID", officeType: "seanad", party: "ie_ind", seatsHeld: 2 },

  // Wexford (WEX): 7 seats.
  { state: "WEX", officeType: "seanad", party: "ie_ff", seatsHeld: 2 },
  { state: "WEX", officeType: "seanad", party: "ie_fg", seatsHeld: 2 },
  { state: "WEX", officeType: "seanad", party: "ie_sf", seatsHeld: 1 },
  { state: "WEX", officeType: "seanad", party: "ie_labour", seatsHeld: 1 },
  { state: "WEX", officeType: "seanad", party: "ie_ind", seatsHeld: 1 },

  // Limerick (LIM): 7 seats — FF/FG rural balance.
  { state: "LIM", officeType: "seanad", party: "ie_ff", seatsHeld: 3 },
  { state: "LIM", officeType: "seanad", party: "ie_fg", seatsHeld: 2 },
  { state: "LIM", officeType: "seanad", party: "ie_ind", seatsHeld: 2 },

  // Cork (COR): 8 seats — FF/FG stronghold, modest SF foothold.
  { state: "COR", officeType: "seanad", party: "ie_ff", seatsHeld: 3 },
  { state: "COR", officeType: "seanad", party: "ie_fg", seatsHeld: 3 },
  { state: "COR", officeType: "seanad", party: "ie_sf", seatsHeld: 1 },
  { state: "COR", officeType: "seanad", party: "ie_ind", seatsHeld: 1 },

  // Galway (GAL): 7 seats — FF/FG rural seats + one Green panel pick.
  { state: "GAL", officeType: "seanad", party: "ie_ff", seatsHeld: 2 },
  { state: "GAL", officeType: "seanad", party: "ie_fg", seatsHeld: 2 },
  { state: "GAL", officeType: "seanad", party: "ie_green", seatsHeld: 1 },
  { state: "GAL", officeType: "seanad", party: "ie_ind", seatsHeld: 2 },

  // Donegal (DON): 7 seats — SF stronghold (border region).
  { state: "DON", officeType: "seanad", party: "ie_ff", seatsHeld: 2 },
  { state: "DON", officeType: "seanad", party: "ie_fg", seatsHeld: 1 },
  { state: "DON", officeType: "seanad", party: "ie_sf", seatsHeld: 2 },
  { state: "DON", officeType: "seanad", party: "ie_labour", seatsHeld: 1 },
  { state: "DON", officeType: "seanad", party: "ie_ind", seatsHeld: 1 },
];
