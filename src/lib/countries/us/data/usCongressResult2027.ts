import type { HistoricalSeat } from "@/lib/constants/historicalSeats";

/**
 * January 2027 US Congress from the November 3, 2026 election results.
 *
 * This replaces the frozen pre-election projection
 * (`usCongressProjection2027.ts`, kept unchanged for the record) as the seed
 * for the 2027 world. Party allocations only: every office holder is a
 * generated fictional person.
 *
 * Status: called results, not yet certified. Snapshot of Associated Press race
 * calls as of 11:15 PM EST, November 6, 2026 (House 254 D, 162 R, 19 uncalled;
 * Senate Alaska and Mississippi uncalled). States certify through December;
 * replace this file deliberately if a call is reversed or once certified.
 *
 * Uncalled seats keep the frozen projection's value. The projection is a
 * per-state count, so an uncalled House seat goes to whichever party the
 * called seats leave short of its projected state total.
 *
 * Uncalled House seats (party used): AK-AL (R), AZ-2 (R), CA-4 (D), CA-7 (D),
 * CA-23 (R), CA-40 (R), CO-4 (R), FL-7 (R), FL-26 (R), FL-27 (R), LA-5 (R),
 * LA-6 (R), MN-1 (R), NC-3 (R), NC-5 (R), NC-7 (R), NC-10 (R), SC-2 (R),
 * WA-5 (R).
 * Uncalled Senate seats (party used): Alaska Class 2 (R), Mississippi
 * Class 2 (R).
 *
 * Sources:
 * - AP News, 2026 US House election results and 2026 US Senate election
 *   results pages, race calls as of November 6, 2026.
 * - Wikipedia, "2026 United States House of Representatives elections" and
 *   "2026 United States Senate elections", district and race tables
 *   compiled from AP calls, revision of November 6, 2026.
 * - NBC News, 2026 House election live results page, November 2026.
 *
 * Do not silently refresh these numbers. A later count or the certified
 * result must update the status line, the uncalled lists and the rosters
 * together.
 */
export const US_CONGRESS_RESULT_2027 = {
  electionDate: "2026-11-03",
  snapshotDate: "2026-11-06",
  basis: "called results before certification",
  house: {
    democrat: 256,
    republican: 179,
    uncalledSeats: [
      "AK-AL",
      "AZ-2",
      "CA-4",
      "CA-7",
      "CA-23",
      "CA-40",
      "CO-4",
      "FL-7",
      "FL-26",
      "FL-27",
      "LA-5",
      "LA-6",
      "MN-1",
      "NC-3",
      "NC-5",
      "NC-7",
      "NC-10",
      "SC-2",
      "WA-5",
    ],
  },
  senate: {
    democraticAligned: 54,
    republican: 46,
    controllingParty: "democrat",
    controlBasis: "outright majority",
    uncalledSeats: ["AK-2", "MS-2"],
  },
} as const;

/**
 * US House by state and party. Democratic seats include candidates also
 * carried on fusion lines; Republican seats likewise.
 */
export const US_HOUSE_2027_RESULT: HistoricalSeat[] = [
  { state: "AK", officeType: "house", party: "republican", seatsHeld: 1 },
  { state: "AL", officeType: "house", party: "democrat", seatsHeld: 2 },
  { state: "AL", officeType: "house", party: "republican", seatsHeld: 5 },
  { state: "AR", officeType: "house", party: "republican", seatsHeld: 4 },
  { state: "AZ", officeType: "house", party: "democrat", seatsHeld: 5 },
  { state: "AZ", officeType: "house", party: "republican", seatsHeld: 4 },
  { state: "CA", officeType: "house", party: "democrat", seatsHeld: 48 },
  { state: "CA", officeType: "house", party: "republican", seatsHeld: 4 },
  { state: "CO", officeType: "house", party: "democrat", seatsHeld: 6 },
  { state: "CO", officeType: "house", party: "republican", seatsHeld: 2 },
  { state: "CT", officeType: "house", party: "democrat", seatsHeld: 5 },
  { state: "DE", officeType: "house", party: "democrat", seatsHeld: 1 },
  { state: "FL", officeType: "house", party: "democrat", seatsHeld: 8 },
  { state: "FL", officeType: "house", party: "republican", seatsHeld: 20 },
  { state: "GA", officeType: "house", party: "democrat", seatsHeld: 5 },
  { state: "GA", officeType: "house", party: "republican", seatsHeld: 9 },
  { state: "HI", officeType: "house", party: "democrat", seatsHeld: 2 },
  { state: "IA", officeType: "house", party: "democrat", seatsHeld: 3 },
  { state: "IA", officeType: "house", party: "republican", seatsHeld: 1 },
  { state: "ID", officeType: "house", party: "republican", seatsHeld: 2 },
  { state: "IL", officeType: "house", party: "democrat", seatsHeld: 14 },
  { state: "IL", officeType: "house", party: "republican", seatsHeld: 3 },
  { state: "IN", officeType: "house", party: "democrat", seatsHeld: 3 },
  { state: "IN", officeType: "house", party: "republican", seatsHeld: 6 },
  { state: "KS", officeType: "house", party: "democrat", seatsHeld: 1 },
  { state: "KS", officeType: "house", party: "republican", seatsHeld: 3 },
  { state: "KY", officeType: "house", party: "democrat", seatsHeld: 2 },
  { state: "KY", officeType: "house", party: "republican", seatsHeld: 4 },
  { state: "LA", officeType: "house", party: "democrat", seatsHeld: 1 },
  { state: "LA", officeType: "house", party: "republican", seatsHeld: 5 },
  { state: "MA", officeType: "house", party: "democrat", seatsHeld: 9 },
  { state: "MD", officeType: "house", party: "democrat", seatsHeld: 7 },
  { state: "MD", officeType: "house", party: "republican", seatsHeld: 1 },
  { state: "ME", officeType: "house", party: "democrat", seatsHeld: 1 },
  { state: "ME", officeType: "house", party: "republican", seatsHeld: 1 },
  { state: "MI", officeType: "house", party: "democrat", seatsHeld: 9 },
  { state: "MI", officeType: "house", party: "republican", seatsHeld: 4 },
  { state: "MN", officeType: "house", party: "democrat", seatsHeld: 4 },
  { state: "MN", officeType: "house", party: "republican", seatsHeld: 4 },
  { state: "MO", officeType: "house", party: "democrat", seatsHeld: 3 },
  { state: "MO", officeType: "house", party: "republican", seatsHeld: 5 },
  { state: "MS", officeType: "house", party: "democrat", seatsHeld: 1 },
  { state: "MS", officeType: "house", party: "republican", seatsHeld: 3 },
  { state: "MT", officeType: "house", party: "democrat", seatsHeld: 1 },
  { state: "MT", officeType: "house", party: "republican", seatsHeld: 1 },
  { state: "NC", officeType: "house", party: "democrat", seatsHeld: 9 },
  { state: "NC", officeType: "house", party: "republican", seatsHeld: 5 },
  { state: "ND", officeType: "house", party: "republican", seatsHeld: 1 },
  { state: "NE", officeType: "house", party: "democrat", seatsHeld: 1 },
  { state: "NE", officeType: "house", party: "republican", seatsHeld: 2 },
  { state: "NH", officeType: "house", party: "democrat", seatsHeld: 2 },
  { state: "NJ", officeType: "house", party: "democrat", seatsHeld: 11 },
  { state: "NJ", officeType: "house", party: "republican", seatsHeld: 1 },
  { state: "NM", officeType: "house", party: "democrat", seatsHeld: 3 },
  { state: "NV", officeType: "house", party: "democrat", seatsHeld: 4 },
  { state: "NY", officeType: "house", party: "democrat", seatsHeld: 20 },
  { state: "NY", officeType: "house", party: "republican", seatsHeld: 6 },
  { state: "OH", officeType: "house", party: "democrat", seatsHeld: 8 },
  { state: "OH", officeType: "house", party: "republican", seatsHeld: 7 },
  { state: "OK", officeType: "house", party: "republican", seatsHeld: 5 },
  { state: "OR", officeType: "house", party: "democrat", seatsHeld: 5 },
  { state: "OR", officeType: "house", party: "republican", seatsHeld: 1 },
  { state: "PA", officeType: "house", party: "democrat", seatsHeld: 11 },
  { state: "PA", officeType: "house", party: "republican", seatsHeld: 6 },
  { state: "RI", officeType: "house", party: "democrat", seatsHeld: 2 },
  { state: "SC", officeType: "house", party: "democrat", seatsHeld: 2 },
  { state: "SC", officeType: "house", party: "republican", seatsHeld: 5 },
  { state: "SD", officeType: "house", party: "republican", seatsHeld: 1 },
  { state: "TN", officeType: "house", party: "democrat", seatsHeld: 1 },
  { state: "TN", officeType: "house", party: "republican", seatsHeld: 8 },
  { state: "TX", officeType: "house", party: "democrat", seatsHeld: 14 },
  { state: "TX", officeType: "house", party: "republican", seatsHeld: 24 },
  { state: "UT", officeType: "house", party: "democrat", seatsHeld: 1 },
  { state: "UT", officeType: "house", party: "republican", seatsHeld: 3 },
  { state: "VA", officeType: "house", party: "democrat", seatsHeld: 8 },
  { state: "VA", officeType: "house", party: "republican", seatsHeld: 3 },
  { state: "VT", officeType: "house", party: "democrat", seatsHeld: 1 },
  { state: "WA", officeType: "house", party: "democrat", seatsHeld: 8 },
  { state: "WA", officeType: "house", party: "republican", seatsHeld: 2 },
  { state: "WI", officeType: "house", party: "democrat", seatsHeld: 4 },
  { state: "WI", officeType: "house", party: "republican", seatsHeld: 4 },
  { state: "WV", officeType: "house", party: "republican", seatsHeld: 2 },
  { state: "WY", officeType: "house", party: "republican", seatsHeld: 1 },
];

/**
 * US Senate, one row per seat. Classes 1 and 3 are 119th Congress holdovers
 * except the 2026 Florida (Republican hold) and Ohio (Democratic gain) Class 3
 * special elections. Class 2 is the 2026 result: Democratic gains in Iowa,
 * Kansas, Maine, North Carolina, South Carolina and Texas. The two
 * independents (Maine and Vermont Class 1) count toward the Democratic-aligned
 * total.
 */
export const US_SENATE_2027_RESULT: HistoricalSeat[] = [
  { state: "AL", officeType: "senate", party: "republican", senateClass: 2 },
  { state: "AL", officeType: "senate", party: "republican", senateClass: 3 },
  { state: "AK", officeType: "senate", party: "republican", senateClass: 2 },
  { state: "AK", officeType: "senate", party: "republican", senateClass: 3 },
  { state: "AZ", officeType: "senate", party: "democrat", senateClass: 1 },
  { state: "AZ", officeType: "senate", party: "democrat", senateClass: 3 },
  { state: "AR", officeType: "senate", party: "republican", senateClass: 2 },
  { state: "AR", officeType: "senate", party: "republican", senateClass: 3 },
  { state: "CA", officeType: "senate", party: "democrat", senateClass: 1 },
  { state: "CA", officeType: "senate", party: "democrat", senateClass: 3 },
  { state: "CO", officeType: "senate", party: "democrat", senateClass: 2 },
  { state: "CO", officeType: "senate", party: "democrat", senateClass: 3 },
  { state: "CT", officeType: "senate", party: "democrat", senateClass: 1 },
  { state: "CT", officeType: "senate", party: "democrat", senateClass: 3 },
  { state: "DE", officeType: "senate", party: "democrat", senateClass: 1 },
  { state: "DE", officeType: "senate", party: "democrat", senateClass: 2 },
  { state: "FL", officeType: "senate", party: "republican", senateClass: 1 },
  { state: "FL", officeType: "senate", party: "republican", senateClass: 3 },
  { state: "GA", officeType: "senate", party: "democrat", senateClass: 2 },
  { state: "GA", officeType: "senate", party: "democrat", senateClass: 3 },
  { state: "HI", officeType: "senate", party: "democrat", senateClass: 1 },
  { state: "HI", officeType: "senate", party: "democrat", senateClass: 3 },
  { state: "ID", officeType: "senate", party: "republican", senateClass: 2 },
  { state: "ID", officeType: "senate", party: "republican", senateClass: 3 },
  { state: "IL", officeType: "senate", party: "democrat", senateClass: 2 },
  { state: "IL", officeType: "senate", party: "democrat", senateClass: 3 },
  { state: "IN", officeType: "senate", party: "republican", senateClass: 1 },
  { state: "IN", officeType: "senate", party: "republican", senateClass: 3 },
  { state: "IA", officeType: "senate", party: "democrat", senateClass: 2 },
  { state: "IA", officeType: "senate", party: "republican", senateClass: 3 },
  { state: "KS", officeType: "senate", party: "democrat", senateClass: 2 },
  { state: "KS", officeType: "senate", party: "republican", senateClass: 3 },
  { state: "KY", officeType: "senate", party: "republican", senateClass: 2 },
  { state: "KY", officeType: "senate", party: "republican", senateClass: 3 },
  { state: "LA", officeType: "senate", party: "republican", senateClass: 2 },
  { state: "LA", officeType: "senate", party: "republican", senateClass: 3 },
  { state: "ME", officeType: "senate", party: "independent", senateClass: 1 },
  { state: "ME", officeType: "senate", party: "democrat", senateClass: 2 },
  { state: "MD", officeType: "senate", party: "democrat", senateClass: 1 },
  { state: "MD", officeType: "senate", party: "democrat", senateClass: 3 },
  { state: "MA", officeType: "senate", party: "democrat", senateClass: 1 },
  { state: "MA", officeType: "senate", party: "democrat", senateClass: 2 },
  { state: "MI", officeType: "senate", party: "democrat", senateClass: 1 },
  { state: "MI", officeType: "senate", party: "democrat", senateClass: 2 },
  { state: "MN", officeType: "senate", party: "democrat", senateClass: 1 },
  { state: "MN", officeType: "senate", party: "democrat", senateClass: 2 },
  { state: "MS", officeType: "senate", party: "republican", senateClass: 1 },
  { state: "MS", officeType: "senate", party: "republican", senateClass: 2 },
  { state: "MO", officeType: "senate", party: "republican", senateClass: 1 },
  { state: "MO", officeType: "senate", party: "republican", senateClass: 3 },
  { state: "MT", officeType: "senate", party: "republican", senateClass: 1 },
  { state: "MT", officeType: "senate", party: "republican", senateClass: 2 },
  { state: "NE", officeType: "senate", party: "republican", senateClass: 1 },
  { state: "NE", officeType: "senate", party: "republican", senateClass: 2 },
  { state: "NV", officeType: "senate", party: "democrat", senateClass: 1 },
  { state: "NV", officeType: "senate", party: "democrat", senateClass: 3 },
  { state: "NH", officeType: "senate", party: "democrat", senateClass: 2 },
  { state: "NH", officeType: "senate", party: "democrat", senateClass: 3 },
  { state: "NJ", officeType: "senate", party: "democrat", senateClass: 1 },
  { state: "NJ", officeType: "senate", party: "democrat", senateClass: 2 },
  { state: "NM", officeType: "senate", party: "democrat", senateClass: 1 },
  { state: "NM", officeType: "senate", party: "democrat", senateClass: 2 },
  { state: "NY", officeType: "senate", party: "democrat", senateClass: 1 },
  { state: "NY", officeType: "senate", party: "democrat", senateClass: 3 },
  { state: "NC", officeType: "senate", party: "democrat", senateClass: 2 },
  { state: "NC", officeType: "senate", party: "republican", senateClass: 3 },
  { state: "ND", officeType: "senate", party: "republican", senateClass: 1 },
  { state: "ND", officeType: "senate", party: "republican", senateClass: 3 },
  { state: "OH", officeType: "senate", party: "republican", senateClass: 1 },
  { state: "OH", officeType: "senate", party: "democrat", senateClass: 3 },
  { state: "OK", officeType: "senate", party: "republican", senateClass: 2 },
  { state: "OK", officeType: "senate", party: "republican", senateClass: 3 },
  { state: "OR", officeType: "senate", party: "democrat", senateClass: 2 },
  { state: "OR", officeType: "senate", party: "democrat", senateClass: 3 },
  { state: "PA", officeType: "senate", party: "republican", senateClass: 1 },
  { state: "PA", officeType: "senate", party: "democrat", senateClass: 3 },
  { state: "RI", officeType: "senate", party: "democrat", senateClass: 1 },
  { state: "RI", officeType: "senate", party: "democrat", senateClass: 2 },
  { state: "SC", officeType: "senate", party: "democrat", senateClass: 2 },
  { state: "SC", officeType: "senate", party: "republican", senateClass: 3 },
  { state: "SD", officeType: "senate", party: "republican", senateClass: 2 },
  { state: "SD", officeType: "senate", party: "republican", senateClass: 3 },
  { state: "TN", officeType: "senate", party: "republican", senateClass: 1 },
  { state: "TN", officeType: "senate", party: "republican", senateClass: 2 },
  { state: "TX", officeType: "senate", party: "republican", senateClass: 1 },
  { state: "TX", officeType: "senate", party: "democrat", senateClass: 2 },
  { state: "UT", officeType: "senate", party: "republican", senateClass: 1 },
  { state: "UT", officeType: "senate", party: "republican", senateClass: 3 },
  { state: "VT", officeType: "senate", party: "independent", senateClass: 1 },
  { state: "VT", officeType: "senate", party: "democrat", senateClass: 3 },
  { state: "VA", officeType: "senate", party: "democrat", senateClass: 1 },
  { state: "VA", officeType: "senate", party: "democrat", senateClass: 2 },
  { state: "WA", officeType: "senate", party: "democrat", senateClass: 1 },
  { state: "WA", officeType: "senate", party: "democrat", senateClass: 3 },
  { state: "WV", officeType: "senate", party: "republican", senateClass: 1 },
  { state: "WV", officeType: "senate", party: "republican", senateClass: 2 },
  { state: "WI", officeType: "senate", party: "democrat", senateClass: 1 },
  { state: "WI", officeType: "senate", party: "republican", senateClass: 3 },
  { state: "WY", officeType: "senate", party: "republican", senateClass: 1 },
  { state: "WY", officeType: "senate", party: "republican", senateClass: 2 },
];
