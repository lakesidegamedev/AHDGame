import type { HistoricalSeat } from "@/lib/constants/historicalSeats";

/**
 * January 2027 US governors and state senates after the November 2026
 * elections (called results, not certified, as of November 6, 2026). Party
 * allocations only: every office holder is a generated fictional person.
 *
 * Governors: the 36 states that voted in 2026 use the called winner's party;
 * uncalled Alaska and Kansas and the other 14 states keep the sitting party.
 *
 * State senates: one row per party summing to the modeled chamber size, tagged
 * "result", "pre-election" or "no 2026 election". Independents count with their
 * caucus, else the majority. Wyoming's 31 seats scale to 30; Nebraska omitted.
 */
export const US_GOVERNORS_2027: HistoricalSeat[] = [
  { state: "AK", officeType: "governor", party: "republican" },
  { state: "AL", officeType: "governor", party: "republican" },
  { state: "AR", officeType: "governor", party: "republican" },
  { state: "AZ", officeType: "governor", party: "democrat" },
  { state: "CA", officeType: "governor", party: "democrat" },
  { state: "CO", officeType: "governor", party: "democrat" },
  { state: "CT", officeType: "governor", party: "democrat" },
  { state: "DE", officeType: "governor", party: "democrat" },
  { state: "FL", officeType: "governor", party: "republican" },
  { state: "GA", officeType: "governor", party: "democrat" },
  { state: "HI", officeType: "governor", party: "democrat" },
  { state: "IA", officeType: "governor", party: "democrat" },
  { state: "ID", officeType: "governor", party: "republican" },
  { state: "IL", officeType: "governor", party: "democrat" },
  { state: "IN", officeType: "governor", party: "republican" },
  { state: "KS", officeType: "governor", party: "democrat" },
  { state: "KY", officeType: "governor", party: "democrat" },
  { state: "LA", officeType: "governor", party: "republican" },
  { state: "MA", officeType: "governor", party: "democrat" },
  { state: "MD", officeType: "governor", party: "democrat" },
  { state: "ME", officeType: "governor", party: "democrat" },
  { state: "MI", officeType: "governor", party: "democrat" },
  { state: "MN", officeType: "governor", party: "democrat" },
  { state: "MO", officeType: "governor", party: "republican" },
  { state: "MS", officeType: "governor", party: "republican" },
  { state: "MT", officeType: "governor", party: "republican" },
  { state: "NC", officeType: "governor", party: "democrat" },
  { state: "ND", officeType: "governor", party: "republican" },
  { state: "NE", officeType: "governor", party: "republican" },
  { state: "NH", officeType: "governor", party: "republican" },
  { state: "NJ", officeType: "governor", party: "democrat" },
  { state: "NM", officeType: "governor", party: "democrat" },
  { state: "NV", officeType: "governor", party: "democrat" },
  { state: "NY", officeType: "governor", party: "democrat" },
  { state: "OH", officeType: "governor", party: "democrat" },
  { state: "OK", officeType: "governor", party: "republican" },
  { state: "OR", officeType: "governor", party: "democrat" },
  { state: "PA", officeType: "governor", party: "democrat" },
  { state: "RI", officeType: "governor", party: "democrat" },
  { state: "SC", officeType: "governor", party: "republican" },
  { state: "SD", officeType: "governor", party: "republican" },
  { state: "TN", officeType: "governor", party: "republican" },
  { state: "TX", officeType: "governor", party: "democrat" },
  { state: "UT", officeType: "governor", party: "republican" },
  { state: "VA", officeType: "governor", party: "democrat" },
  { state: "VT", officeType: "governor", party: "republican" },
  { state: "WA", officeType: "governor", party: "democrat" },
  { state: "WI", officeType: "governor", party: "democrat" },
  { state: "WV", officeType: "governor", party: "republican" },
  { state: "WY", officeType: "governor", party: "republican" },
];

export const US_STATE_SENATE_2027: HistoricalSeat[] = [
  // AK: 9D, 11R (pre-election)
  { state: "AK", officeType: "stateSenate", party: "republican", seatsHeld: 11 },
  { state: "AK", officeType: "stateSenate", party: "democrat", seatsHeld: 9 },
  // AL: 10D, 25R (result)
  { state: "AL", officeType: "stateSenate", party: "republican", seatsHeld: 25 },
  { state: "AL", officeType: "stateSenate", party: "democrat", seatsHeld: 10 },
  // AR: 7D, 28R (result)
  { state: "AR", officeType: "stateSenate", party: "republican", seatsHeld: 28 },
  { state: "AR", officeType: "stateSenate", party: "democrat", seatsHeld: 7 },
  // AZ: 20D, 10R (result)
  { state: "AZ", officeType: "stateSenate", party: "republican", seatsHeld: 10 },
  { state: "AZ", officeType: "stateSenate", party: "democrat", seatsHeld: 20 },
  // CA: 30D, 10R (pre-election)
  { state: "CA", officeType: "stateSenate", party: "republican", seatsHeld: 10 },
  { state: "CA", officeType: "stateSenate", party: "democrat", seatsHeld: 30 },
  // CO: 24D, 11R (result)
  { state: "CO", officeType: "stateSenate", party: "republican", seatsHeld: 11 },
  { state: "CO", officeType: "stateSenate", party: "democrat", seatsHeld: 24 },
  // CT: 25D, 11R (pre-election)
  { state: "CT", officeType: "stateSenate", party: "republican", seatsHeld: 11 },
  { state: "CT", officeType: "stateSenate", party: "democrat", seatsHeld: 25 },
  // DE: 15D, 6R (result)
  { state: "DE", officeType: "stateSenate", party: "republican", seatsHeld: 6 },
  { state: "DE", officeType: "stateSenate", party: "democrat", seatsHeld: 15 },
  // FL: 12D, 28R (pre-election)
  { state: "FL", officeType: "stateSenate", party: "republican", seatsHeld: 28 },
  { state: "FL", officeType: "stateSenate", party: "democrat", seatsHeld: 12 },
  // GA: 27D, 29R (result)
  { state: "GA", officeType: "stateSenate", party: "republican", seatsHeld: 29 },
  { state: "GA", officeType: "stateSenate", party: "democrat", seatsHeld: 27 },
  // HI: 22D, 3R (result)
  { state: "HI", officeType: "stateSenate", party: "republican", seatsHeld: 3 },
  { state: "HI", officeType: "stateSenate", party: "democrat", seatsHeld: 22 },
  // IA: 17D, 33R (pre-election)
  { state: "IA", officeType: "stateSenate", party: "republican", seatsHeld: 33 },
  { state: "IA", officeType: "stateSenate", party: "democrat", seatsHeld: 17 },
  // ID: 7D, 28R (result)
  { state: "ID", officeType: "stateSenate", party: "republican", seatsHeld: 28 },
  { state: "ID", officeType: "stateSenate", party: "democrat", seatsHeld: 7 },
  // IL: 40D, 19R (pre-election)
  { state: "IL", officeType: "stateSenate", party: "republican", seatsHeld: 19 },
  { state: "IL", officeType: "stateSenate", party: "democrat", seatsHeld: 40 },
  // IN: 10D, 40R (pre-election)
  { state: "IN", officeType: "stateSenate", party: "republican", seatsHeld: 40 },
  { state: "IN", officeType: "stateSenate", party: "democrat", seatsHeld: 10 },
  // KS: 9D, 31R (no 2026 election)
  { state: "KS", officeType: "stateSenate", party: "republican", seatsHeld: 31 },
  { state: "KS", officeType: "stateSenate", party: "democrat", seatsHeld: 9 },
  // KY: 8D, 30R (result)
  { state: "KY", officeType: "stateSenate", party: "republican", seatsHeld: 30 },
  { state: "KY", officeType: "stateSenate", party: "democrat", seatsHeld: 8 },
  // LA: 11D, 28R (no 2026 election)
  { state: "LA", officeType: "stateSenate", party: "republican", seatsHeld: 28 },
  { state: "LA", officeType: "stateSenate", party: "democrat", seatsHeld: 11 },
  // MA: 35D, 5R (result)
  { state: "MA", officeType: "stateSenate", party: "republican", seatsHeld: 5 },
  { state: "MA", officeType: "stateSenate", party: "democrat", seatsHeld: 35 },
  // MD: 34D, 13R (pre-election)
  { state: "MD", officeType: "stateSenate", party: "republican", seatsHeld: 13 },
  { state: "MD", officeType: "stateSenate", party: "democrat", seatsHeld: 34 },
  // ME: 21D, 14R (pre-election)
  { state: "ME", officeType: "stateSenate", party: "republican", seatsHeld: 14 },
  { state: "ME", officeType: "stateSenate", party: "democrat", seatsHeld: 21 },
  // MI: 23D, 15R (result)
  { state: "MI", officeType: "stateSenate", party: "republican", seatsHeld: 15 },
  { state: "MI", officeType: "stateSenate", party: "democrat", seatsHeld: 23 },
  // MN: 34D, 33R (pre-election)
  { state: "MN", officeType: "stateSenate", party: "republican", seatsHeld: 33 },
  { state: "MN", officeType: "stateSenate", party: "democrat", seatsHeld: 34 },
  // MO: 10D, 24R (pre-election)
  { state: "MO", officeType: "stateSenate", party: "republican", seatsHeld: 24 },
  { state: "MO", officeType: "stateSenate", party: "democrat", seatsHeld: 10 },
  // MS: 18D, 34R (no 2026 election)
  { state: "MS", officeType: "stateSenate", party: "republican", seatsHeld: 34 },
  { state: "MS", officeType: "stateSenate", party: "democrat", seatsHeld: 18 },
  // MT: 20D, 30R (result)
  { state: "MT", officeType: "stateSenate", party: "republican", seatsHeld: 30 },
  { state: "MT", officeType: "stateSenate", party: "democrat", seatsHeld: 20 },
  // NC: 20D, 30R (pre-election)
  { state: "NC", officeType: "stateSenate", party: "republican", seatsHeld: 30 },
  { state: "NC", officeType: "stateSenate", party: "democrat", seatsHeld: 20 },
  // ND: 6D, 41R (result)
  { state: "ND", officeType: "stateSenate", party: "republican", seatsHeld: 41 },
  { state: "ND", officeType: "stateSenate", party: "democrat", seatsHeld: 6 },
  // NH: 8D, 16R (pre-election)
  { state: "NH", officeType: "stateSenate", party: "republican", seatsHeld: 16 },
  { state: "NH", officeType: "stateSenate", party: "democrat", seatsHeld: 8 },
  // NJ: 25D, 15R (no 2026 election)
  { state: "NJ", officeType: "stateSenate", party: "republican", seatsHeld: 15 },
  { state: "NJ", officeType: "stateSenate", party: "democrat", seatsHeld: 25 },
  // NM: 26D, 16R (no 2026 election)
  { state: "NM", officeType: "stateSenate", party: "republican", seatsHeld: 16 },
  { state: "NM", officeType: "stateSenate", party: "democrat", seatsHeld: 26 },
  // NV: 13D, 8R (result)
  { state: "NV", officeType: "stateSenate", party: "republican", seatsHeld: 8 },
  { state: "NV", officeType: "stateSenate", party: "democrat", seatsHeld: 13 },
  // NY: 41D, 22R (pre-election)
  { state: "NY", officeType: "stateSenate", party: "republican", seatsHeld: 22 },
  { state: "NY", officeType: "stateSenate", party: "democrat", seatsHeld: 41 },
  // OH: 9D, 24R (pre-election)
  { state: "OH", officeType: "stateSenate", party: "republican", seatsHeld: 24 },
  { state: "OH", officeType: "stateSenate", party: "democrat", seatsHeld: 9 },
  // OK: 8D, 40R (result)
  { state: "OK", officeType: "stateSenate", party: "republican", seatsHeld: 40 },
  { state: "OK", officeType: "stateSenate", party: "democrat", seatsHeld: 8 },
  // OR: 18D, 12R (pre-election)
  { state: "OR", officeType: "stateSenate", party: "republican", seatsHeld: 12 },
  { state: "OR", officeType: "stateSenate", party: "democrat", seatsHeld: 18 },
  // PA: 26D, 24R (result)
  { state: "PA", officeType: "stateSenate", party: "republican", seatsHeld: 24 },
  { state: "PA", officeType: "stateSenate", party: "democrat", seatsHeld: 26 },
  // RI: 36D, 2R (result)
  { state: "RI", officeType: "stateSenate", party: "republican", seatsHeld: 2 },
  { state: "RI", officeType: "stateSenate", party: "democrat", seatsHeld: 36 },
  // SC: 12D, 34R (no 2026 election)
  { state: "SC", officeType: "stateSenate", party: "republican", seatsHeld: 34 },
  { state: "SC", officeType: "stateSenate", party: "democrat", seatsHeld: 12 },
  // SD: 3D, 32R (pre-election)
  { state: "SD", officeType: "stateSenate", party: "republican", seatsHeld: 32 },
  { state: "SD", officeType: "stateSenate", party: "democrat", seatsHeld: 3 },
  // TN: 6D, 27R (result)
  { state: "TN", officeType: "stateSenate", party: "republican", seatsHeld: 27 },
  { state: "TN", officeType: "stateSenate", party: "democrat", seatsHeld: 6 },
  // TX: 12D, 19R (result)
  { state: "TX", officeType: "stateSenate", party: "republican", seatsHeld: 19 },
  { state: "TX", officeType: "stateSenate", party: "democrat", seatsHeld: 12 },
  // UT: 6D, 23R (pre-election)
  { state: "UT", officeType: "stateSenate", party: "republican", seatsHeld: 23 },
  { state: "UT", officeType: "stateSenate", party: "democrat", seatsHeld: 6 },
  // VA: 21D, 19R (no 2026 election)
  { state: "VA", officeType: "stateSenate", party: "republican", seatsHeld: 19 },
  { state: "VA", officeType: "stateSenate", party: "democrat", seatsHeld: 21 },
  // VT: 22D, 8R (result)
  { state: "VT", officeType: "stateSenate", party: "republican", seatsHeld: 8 },
  { state: "VT", officeType: "stateSenate", party: "democrat", seatsHeld: 22 },
  // WA: 30D, 19R (pre-election)
  { state: "WA", officeType: "stateSenate", party: "republican", seatsHeld: 19 },
  { state: "WA", officeType: "stateSenate", party: "democrat", seatsHeld: 30 },
  // WI: 18D, 15R (result)
  { state: "WI", officeType: "stateSenate", party: "republican", seatsHeld: 15 },
  { state: "WI", officeType: "stateSenate", party: "democrat", seatsHeld: 18 },
  // WV: 4D, 30R (result)
  { state: "WV", officeType: "stateSenate", party: "republican", seatsHeld: 30 },
  { state: "WV", officeType: "stateSenate", party: "democrat", seatsHeld: 4 },
  // WY: 2D, 28R (result)
  { state: "WY", officeType: "stateSenate", party: "republican", seatsHeld: 28 },
  { state: "WY", officeType: "stateSenate", party: "democrat", seatsHeld: 2 },
];
