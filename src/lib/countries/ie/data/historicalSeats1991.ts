import type { HistoricalSeat } from "@/lib/seats/historicalSeat";

// ─── Ireland: 27th Dáil (post-June 1989 general election) ────────────────────
// 160 seats (game model; historical 1989 Dáil had 166 seats, scaled proportionally).
// FF formed government with PD confidence-and-supply. Sinn Féin held no Dáil seats.

export const IE_DAIL_1991: HistoricalSeat[] = [
  // Dublin (DUB): ~64 seats
  { state: "DUB", officeType: "dail", party: "ie_ff", seatsHeld: 28 },
  { state: "DUB", officeType: "dail", party: "ie_fg", seatsHeld: 21 },
  { state: "DUB", officeType: "dail", party: "ie_labour", seatsHeld: 7 },
  { state: "DUB", officeType: "dail", party: "ie_wp", seatsHeld: 4 },
  { state: "DUB", officeType: "dail", party: "ie_pd", seatsHeld: 2 },
  { state: "DUB", officeType: "dail", party: "ie_ind", seatsHeld: 2 },

  // Kildare (KIL): ~13 seats
  { state: "KIL", officeType: "dail", party: "ie_ff", seatsHeld: 6 },
  { state: "KIL", officeType: "dail", party: "ie_fg", seatsHeld: 5 },
  { state: "KIL", officeType: "dail", party: "ie_labour", seatsHeld: 1 },
  { state: "KIL", officeType: "dail", party: "ie_pd", seatsHeld: 1 },

  // Midlands (MID): ~10 seats
  { state: "MID", officeType: "dail", party: "ie_ff", seatsHeld: 5 },
  { state: "MID", officeType: "dail", party: "ie_fg", seatsHeld: 4 },
  { state: "MID", officeType: "dail", party: "ie_labour", seatsHeld: 1 },

  // Wexford (WEX): ~14 seats
  { state: "WEX", officeType: "dail", party: "ie_ff", seatsHeld: 7 },
  { state: "WEX", officeType: "dail", party: "ie_fg", seatsHeld: 5 },
  { state: "WEX", officeType: "dail", party: "ie_labour", seatsHeld: 1 },
  { state: "WEX", officeType: "dail", party: "ie_pd", seatsHeld: 1 },

  // Limerick (LIM): ~11 seats
  { state: "LIM", officeType: "dail", party: "ie_ff", seatsHeld: 5 },
  { state: "LIM", officeType: "dail", party: "ie_fg", seatsHeld: 4 },
  { state: "LIM", officeType: "dail", party: "ie_labour", seatsHeld: 1 },
  { state: "LIM", officeType: "dail", party: "ie_pd", seatsHeld: 1 },

  // Cork (COR): ~18 seats
  { state: "COR", officeType: "dail", party: "ie_ff", seatsHeld: 9 },
  { state: "COR", officeType: "dail", party: "ie_fg", seatsHeld: 7 },
  { state: "COR", officeType: "dail", party: "ie_labour", seatsHeld: 1 },
  { state: "COR", officeType: "dail", party: "ie_pd", seatsHeld: 1 },

  // Galway (GAL): ~14 seats
  { state: "GAL", officeType: "dail", party: "ie_ff", seatsHeld: 7 },
  { state: "GAL", officeType: "dail", party: "ie_fg", seatsHeld: 5 },
  { state: "GAL", officeType: "dail", party: "ie_labour", seatsHeld: 1 },
  { state: "GAL", officeType: "dail", party: "ie_ind", seatsHeld: 1 },

  // Donegal (DON): ~16 seats
  { state: "DON", officeType: "dail", party: "ie_ff", seatsHeld: 5 },
  { state: "DON", officeType: "dail", party: "ie_fg", seatsHeld: 2 },
  { state: "DON", officeType: "dail", party: "ie_labour", seatsHeld: 1 },
  { state: "DON", officeType: "dail", party: "ie_wp", seatsHeld: 3 },
  { state: "DON", officeType: "dail", party: "ie_ind", seatsHeld: 5 },
];

// ─── IE Seanad: 19th Seanad (post-June 1989 election) ────────────────────────
// 60 seats total. Composition post-1989 GE under Taoiseach Haughey (FF/PD
// coalition): national totals FF 30, FG 16, Lab 5, PD 6, WP 1, Ind 2.
// PD (`ie_pd`) and WP (`ie_wp`) are 1991-only defaults (validForPresets
// excludes them from 2019-default). Independents are minimal in the 1989
// Seanad — the elected panel + university members were largely partisan.
// Distribution mirrors regional party strength at the 1989 GE.
export const IE_SEANAD_1991: HistoricalSeat[] = [
  // Dublin (DUB): 9 seats — FF dominant; PD strongest here (urban liberal).
  { state: "DUB", officeType: "seanad", party: "ie_ff", seatsHeld: 4 },
  { state: "DUB", officeType: "seanad", party: "ie_fg", seatsHeld: 2 },
  { state: "DUB", officeType: "seanad", party: "ie_labour", seatsHeld: 1 },
  { state: "DUB", officeType: "seanad", party: "ie_pd", seatsHeld: 1 },
  { state: "DUB", officeType: "seanad", party: "ie_wp", seatsHeld: 1 },

  // Kildare (KIL): 8 seats — commuter belt, FF/FG split with PD foothold.
  { state: "KIL", officeType: "seanad", party: "ie_ff", seatsHeld: 4 },
  { state: "KIL", officeType: "seanad", party: "ie_fg", seatsHeld: 2 },
  { state: "KIL", officeType: "seanad", party: "ie_pd", seatsHeld: 2 },

  // Midlands (MID): 7 seats — rural FF heartland.
  { state: "MID", officeType: "seanad", party: "ie_ff", seatsHeld: 4 },
  { state: "MID", officeType: "seanad", party: "ie_fg", seatsHeld: 2 },
  { state: "MID", officeType: "seanad", party: "ie_labour", seatsHeld: 1 },

  // Wexford (WEX): 7 seats.
  { state: "WEX", officeType: "seanad", party: "ie_ff", seatsHeld: 4 },
  { state: "WEX", officeType: "seanad", party: "ie_fg", seatsHeld: 2 },
  { state: "WEX", officeType: "seanad", party: "ie_pd", seatsHeld: 1 },

  // Limerick (LIM): 7 seats — FF/FG split + Labour foothold.
  { state: "LIM", officeType: "seanad", party: "ie_ff", seatsHeld: 4 },
  { state: "LIM", officeType: "seanad", party: "ie_fg", seatsHeld: 2 },
  { state: "LIM", officeType: "seanad", party: "ie_labour", seatsHeld: 1 },

  // Cork (COR): 8 seats — FF/FG stronghold.
  { state: "COR", officeType: "seanad", party: "ie_ff", seatsHeld: 4 },
  { state: "COR", officeType: "seanad", party: "ie_fg", seatsHeld: 2 },
  { state: "COR", officeType: "seanad", party: "ie_labour", seatsHeld: 1 },
  { state: "COR", officeType: "seanad", party: "ie_pd", seatsHeld: 1 },

  // Galway (GAL): 7 seats — rural FF dominance.
  { state: "GAL", officeType: "seanad", party: "ie_ff", seatsHeld: 4 },
  { state: "GAL", officeType: "seanad", party: "ie_fg", seatsHeld: 2 },
  { state: "GAL", officeType: "seanad", party: "ie_pd", seatsHeld: 1 },

  // Donegal (DON): 7 seats — border region; modest FF/FG with stronger
  // Independent presence reflecting the rural-Ulster pattern.
  { state: "DON", officeType: "seanad", party: "ie_ff", seatsHeld: 2 },
  { state: "DON", officeType: "seanad", party: "ie_fg", seatsHeld: 2 },
  { state: "DON", officeType: "seanad", party: "ie_labour", seatsHeld: 1 },
  { state: "DON", officeType: "seanad", party: "ie_independent", seatsHeld: 2 },
];

/** 1991 opening incumbent: Mary Robinson, inaugurated 3 Dec 1990. */
export const IE_UACHTARAN_1991: HistoricalSeat[] = [
  { state: "IE", officeType: "uachtaran", party: "ie_ind" },
];
