import type { HistoricalSeat } from "@/lib/seats/historicalSeat";

// ─── US 1991: State Senate Compositions ─────────────────────────────────────
// Party splits reflect state senate control entering the 1991 legislative
// session, immediately after the November 1990 elections. The 1990 cycle
// was a mild pro-Democratic year — small Dem gains in most chambers,
// preserving the long Southern Democratic dominance and the legacy
// Democratic majorities that would erode over the following decade.
//
// Totals match each state's current `stateSenateSeats` config in
// `src/lib/seeds/reference/states.ts`. Where a chamber's size changed
// between 1990 and today (e.g. NY 61→63, RI 50→38, ND 53→47), the 1990
// partisan ratio is preserved while the absolute counts are scaled to the
// current size.
//
// Nebraska is omitted — its Legislature is unicameral and nonpartisan,
// matching the convention used by US_STATE_SENATE_2020.
//
// Each entry = ONE NPP holding all that party's seats in that state.

export const US_STATE_SENATE_1990: HistoricalSeat[] = [
  // Alabama: 28D, 7R — entrenched Dem South majority
  { state: "AL", officeType: "stateSenate", party: "democrat", seatsHeld: 28 },
  { state: "AL", officeType: "stateSenate", party: "republican", seatsHeld: 7 },
  // Alaska: 9D, 11R — narrow GOP edge under a bipartisan coalition
  { state: "AK", officeType: "stateSenate", party: "democrat", seatsHeld: 9 },
  { state: "AK", officeType: "stateSenate", party: "republican", seatsHeld: 11 },
  // Arizona: 13D, 17R — GOP-controlled
  { state: "AZ", officeType: "stateSenate", party: "democrat", seatsHeld: 13 },
  { state: "AZ", officeType: "stateSenate", party: "republican", seatsHeld: 17 },
  // Arkansas: 31D, 4R — Dem South supermajority
  { state: "AR", officeType: "stateSenate", party: "democrat", seatsHeld: 31 },
  { state: "AR", officeType: "stateSenate", party: "republican", seatsHeld: 4 },
  // California: 25D, 15R — comfortable Dem control under Roberti
  { state: "CA", officeType: "stateSenate", party: "democrat", seatsHeld: 25 },
  { state: "CA", officeType: "stateSenate", party: "republican", seatsHeld: 15 },
  // Colorado: 11D, 24R — GOP-controlled
  { state: "CO", officeType: "stateSenate", party: "democrat", seatsHeld: 11 },
  { state: "CO", officeType: "stateSenate", party: "republican", seatsHeld: 24 },
  // Connecticut: 20D, 16R — Dem majority
  { state: "CT", officeType: "stateSenate", party: "democrat", seatsHeld: 20 },
  { state: "CT", officeType: "stateSenate", party: "republican", seatsHeld: 16 },
  // Delaware: 13D, 8R — Dem control
  { state: "DE", officeType: "stateSenate", party: "democrat", seatsHeld: 13 },
  { state: "DE", officeType: "stateSenate", party: "republican", seatsHeld: 8 },
  // Florida: 23D, 17R — fading Dem South majority
  { state: "FL", officeType: "stateSenate", party: "democrat", seatsHeld: 23 },
  { state: "FL", officeType: "stateSenate", party: "republican", seatsHeld: 17 },
  // Georgia: 45D, 11R — Dem South dominance
  { state: "GA", officeType: "stateSenate", party: "democrat", seatsHeld: 45 },
  { state: "GA", officeType: "stateSenate", party: "republican", seatsHeld: 11 },
  // Hawaii: 22D, 3R — single-party Dem state
  { state: "HI", officeType: "stateSenate", party: "democrat", seatsHeld: 22 },
  { state: "HI", officeType: "stateSenate", party: "republican", seatsHeld: 3 },
  // Idaho: 12D, 23R — GOP-controlled
  { state: "ID", officeType: "stateSenate", party: "democrat", seatsHeld: 12 },
  { state: "ID", officeType: "stateSenate", party: "republican", seatsHeld: 23 },
  // Illinois: 31D, 28R — narrow Dem majority under Rock
  { state: "IL", officeType: "stateSenate", party: "democrat", seatsHeld: 31 },
  { state: "IL", officeType: "stateSenate", party: "republican", seatsHeld: 28 },
  // Indiana: 24D, 26R — narrow GOP control
  { state: "IN", officeType: "stateSenate", party: "democrat", seatsHeld: 24 },
  { state: "IN", officeType: "stateSenate", party: "republican", seatsHeld: 26 },
  // Iowa: 28D, 22R — Dem majority
  { state: "IA", officeType: "stateSenate", party: "democrat", seatsHeld: 28 },
  { state: "IA", officeType: "stateSenate", party: "republican", seatsHeld: 22 },
  // Kansas: 18D, 22R — GOP control
  { state: "KS", officeType: "stateSenate", party: "democrat", seatsHeld: 18 },
  { state: "KS", officeType: "stateSenate", party: "republican", seatsHeld: 22 },
  // Kentucky: 28D, 10R — Dem South majority
  { state: "KY", officeType: "stateSenate", party: "democrat", seatsHeld: 28 },
  { state: "KY", officeType: "stateSenate", party: "republican", seatsHeld: 10 },
  // Louisiana: 35D, 4R — Dem South supermajority
  { state: "LA", officeType: "stateSenate", party: "democrat", seatsHeld: 35 },
  { state: "LA", officeType: "stateSenate", party: "republican", seatsHeld: 4 },
  // Maine: 22D, 13R — Dem majority
  { state: "ME", officeType: "stateSenate", party: "democrat", seatsHeld: 22 },
  { state: "ME", officeType: "stateSenate", party: "republican", seatsHeld: 13 },
  // Maryland: 38D, 9R — Dem dominance
  { state: "MD", officeType: "stateSenate", party: "democrat", seatsHeld: 38 },
  { state: "MD", officeType: "stateSenate", party: "republican", seatsHeld: 9 },
  // Massachusetts: 32D, 8R — Dem dominance under Bulger
  { state: "MA", officeType: "stateSenate", party: "democrat", seatsHeld: 32 },
  { state: "MA", officeType: "stateSenate", party: "republican", seatsHeld: 8 },
  // Michigan: 18D, 20R — narrow GOP control
  { state: "MI", officeType: "stateSenate", party: "democrat", seatsHeld: 18 },
  { state: "MI", officeType: "stateSenate", party: "republican", seatsHeld: 20 },
  // Minnesota: 45 DFL, 22 IR — DFL/IR mapped to democrat/republican
  { state: "MN", officeType: "stateSenate", party: "democrat", seatsHeld: 45 },
  { state: "MN", officeType: "stateSenate", party: "republican", seatsHeld: 22 },
  // Mississippi: 47D, 5R — Dem South supermajority
  { state: "MS", officeType: "stateSenate", party: "democrat", seatsHeld: 47 },
  { state: "MS", officeType: "stateSenate", party: "republican", seatsHeld: 5 },
  // Missouri: 22D, 12R — Dem majority
  { state: "MO", officeType: "stateSenate", party: "democrat", seatsHeld: 22 },
  { state: "MO", officeType: "stateSenate", party: "republican", seatsHeld: 12 },
  // Montana: 27D, 23R — narrow Dem control
  { state: "MT", officeType: "stateSenate", party: "democrat", seatsHeld: 27 },
  { state: "MT", officeType: "stateSenate", party: "republican", seatsHeld: 23 },
  // Nebraska: unicameral nonpartisan — omitted
  // Nevada: 11D, 10R — narrow Dem majority
  { state: "NV", officeType: "stateSenate", party: "democrat", seatsHeld: 11 },
  { state: "NV", officeType: "stateSenate", party: "republican", seatsHeld: 10 },
  // New Hampshire: 9D, 15R — GOP control
  { state: "NH", officeType: "stateSenate", party: "democrat", seatsHeld: 9 },
  { state: "NH", officeType: "stateSenate", party: "republican", seatsHeld: 15 },
  // New Jersey: 23D, 17R — Dem majority (post-1991 cycle)
  { state: "NJ", officeType: "stateSenate", party: "democrat", seatsHeld: 23 },
  { state: "NJ", officeType: "stateSenate", party: "republican", seatsHeld: 17 },
  // New Mexico: 26D, 16R — Dem majority
  { state: "NM", officeType: "stateSenate", party: "democrat", seatsHeld: 26 },
  { state: "NM", officeType: "stateSenate", party: "republican", seatsHeld: 16 },
  // New York: 26D, 37R — GOP control under Marino (1990 was 61 seats; scaled to current 63)
  { state: "NY", officeType: "stateSenate", party: "democrat", seatsHeld: 26 },
  { state: "NY", officeType: "stateSenate", party: "republican", seatsHeld: 37 },
  // North Carolina: 37D, 13R — Dem South majority
  { state: "NC", officeType: "stateSenate", party: "democrat", seatsHeld: 37 },
  { state: "NC", officeType: "stateSenate", party: "republican", seatsHeld: 13 },
  // North Dakota: 24D, 23R — tight split (1990 had 53 seats; scaled to current 47)
  { state: "ND", officeType: "stateSenate", party: "democrat", seatsHeld: 24 },
  { state: "ND", officeType: "stateSenate", party: "republican", seatsHeld: 23 },
  // Ohio: 12D, 21R — GOP control
  { state: "OH", officeType: "stateSenate", party: "democrat", seatsHeld: 12 },
  { state: "OH", officeType: "stateSenate", party: "republican", seatsHeld: 21 },
  // Oklahoma: 33D, 15R — Dem South majority
  { state: "OK", officeType: "stateSenate", party: "democrat", seatsHeld: 33 },
  { state: "OK", officeType: "stateSenate", party: "republican", seatsHeld: 15 },
  // Oregon: 19D, 11R — Dem majority
  { state: "OR", officeType: "stateSenate", party: "democrat", seatsHeld: 19 },
  { state: "OR", officeType: "stateSenate", party: "republican", seatsHeld: 11 },
  // Pennsylvania: 24D, 26R — narrow GOP control
  { state: "PA", officeType: "stateSenate", party: "democrat", seatsHeld: 24 },
  { state: "PA", officeType: "stateSenate", party: "republican", seatsHeld: 26 },
  // Rhode Island: 33D, 5R — Dem dominance (1990 had 50 seats; scaled to current 38)
  { state: "RI", officeType: "stateSenate", party: "democrat", seatsHeld: 33 },
  { state: "RI", officeType: "stateSenate", party: "republican", seatsHeld: 5 },
  // South Carolina: 36D, 10R — Dem South majority
  { state: "SC", officeType: "stateSenate", party: "democrat", seatsHeld: 36 },
  { state: "SC", officeType: "stateSenate", party: "republican", seatsHeld: 10 },
  // South Dakota: 14D, 21R — GOP control
  { state: "SD", officeType: "stateSenate", party: "democrat", seatsHeld: 14 },
  { state: "SD", officeType: "stateSenate", party: "republican", seatsHeld: 21 },
  // Tennessee: 22D, 11R — Dem South majority
  { state: "TN", officeType: "stateSenate", party: "democrat", seatsHeld: 22 },
  { state: "TN", officeType: "stateSenate", party: "republican", seatsHeld: 11 },
  // Texas: 23D, 8R — Dem South majority, eroding fast
  { state: "TX", officeType: "stateSenate", party: "democrat", seatsHeld: 23 },
  { state: "TX", officeType: "stateSenate", party: "republican", seatsHeld: 8 },
  // Utah: 7D, 22R — GOP dominance
  { state: "UT", officeType: "stateSenate", party: "democrat", seatsHeld: 7 },
  { state: "UT", officeType: "stateSenate", party: "republican", seatsHeld: 22 },
  // Vermont: 15D, 15R — tied chamber; GOP organized via Lt. Gov tiebreak
  { state: "VT", officeType: "stateSenate", party: "democrat", seatsHeld: 15 },
  { state: "VT", officeType: "stateSenate", party: "republican", seatsHeld: 15 },
  // Virginia: 30D, 10R — Dem South majority
  { state: "VA", officeType: "stateSenate", party: "democrat", seatsHeld: 30 },
  { state: "VA", officeType: "stateSenate", party: "republican", seatsHeld: 10 },
  // Washington: 25D, 24R — narrow Dem majority
  { state: "WA", officeType: "stateSenate", party: "democrat", seatsHeld: 25 },
  { state: "WA", officeType: "stateSenate", party: "republican", seatsHeld: 24 },
  // West Virginia: 30D, 4R — Dem dominance
  { state: "WV", officeType: "stateSenate", party: "democrat", seatsHeld: 30 },
  { state: "WV", officeType: "stateSenate", party: "republican", seatsHeld: 4 },
  // Wisconsin: 19D, 14R — Dem majority
  { state: "WI", officeType: "stateSenate", party: "democrat", seatsHeld: 19 },
  { state: "WI", officeType: "stateSenate", party: "republican", seatsHeld: 14 },
  // Wyoming: 10D, 20R — GOP control
  { state: "WY", officeType: "stateSenate", party: "democrat", seatsHeld: 10 },
  { state: "WY", officeType: "stateSenate", party: "republican", seatsHeld: 20 },
];
