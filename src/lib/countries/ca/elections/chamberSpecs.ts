import { defineChamberSpec } from "@/lib/elections/scheduling/chamberSpec";
import { CA_PROVINCIAL_SEATS } from "../data/caProvincialLegislatures";
import {
  CA_PROVINCIAL_PERIOD_HOURS,
  provincialCycle1EndTurn,
} from "../rules/provincialLegislature";

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

/**
 * Provincial and territorial legislatures: one race per region, sized by its
 * legislature, each on its own fixed-date four-year cycle. The Commons anchor
 * only gates the chamber to eras where Canada is a country.
 */
export const CA_PROVINCIAL_SPEC = defineChamberSpec({
  chamberId: "provincialLegislature",
  countryId: "CA",
  electionType: "provincialLegislature",
  constituencies: "regions",
  seats: { kind: "table", table: CA_PROVINCIAL_SEATS, missing: "throw" },
  electoralSystem: "plurality",
  cycle: { anchor: "caCommons", periodHours: CA_PROVINCIAL_PERIOD_HOURS },
  gate: "countryLive",
  lateJoiners: "ownCycle",
  openPrimaryImmediately: true,
  byElections: "none",
  snap: "none",
  healLiveSeats: false,
  regionAnchor: (regionId, _preset, ctx) => provincialCycle1EndTurn(regionId, ctx),
  silent: true,
});

export const CA_CHAMBER_SPECS = [CA_COMMONS_SPEC, CA_PROVINCIAL_SPEC] as const;
