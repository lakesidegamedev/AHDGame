import { defineChamberSpec } from "@/lib/elections/scheduling/chamberSpec";

/**
 * House of Commons: regional contests sized by each region's seeded
 * `houseDistricts` (343 seats across 13 provinces and territories), on a fixed
 * four-year term. A snap election restarts the clock. A seat vacated mid-term
 * is refilled by a `special_caCommons` by-election.
 */
export const CA_COMMONS_SPEC = defineChamberSpec({
  chamberId: "caCommons",
  countryId: "CA",
  electionType: "caCommons",
  constituencies: "regions",
  seats: { kind: "stateField", field: "houseDistricts", missing: "throw" },
  electoralSystem: "plurality",
  cycle: { anchor: "caCommons", periodHours: 192 },
  gate: "countryLive",
  lateJoiners: "ownCycle",
  openPrimaryImmediately: true,
  byElections: "special",
  snap: "shiftsCycle",
  healLiveSeats: false,
});

export const CA_CHAMBER_SPECS = [CA_COMMONS_SPEC] as const;
