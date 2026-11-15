import { defineChamberSpec } from "@/lib/elections/scheduling/chamberSpec";
import { NG_REGIONAL_COUNCIL_SEATS } from "@/lib/constants/states";

/** Every NG office rides one concurrent four-year general-election cycle. */
const GENERAL_CYCLE = { anchor: "ngGeneral", periodHours: 192 } as const;

/** House of Representatives: multi-seat zones sized by `houseDistricts`. */
export const NG_HOUSE_SPEC = defineChamberSpec({
  chamberId: "house",
  countryId: "NG",
  electionType: "house",
  constituencies: "regions",
  seats: { kind: "stateField", field: "houseDistricts", enforce: "positive", missing: "throw" },
  electoralSystem: "plurality",
  cycle: GENERAL_CYCLE,
  gate: "countryLive",
  lateJoiners: "ownCycle",
  openPrimaryImmediately: true,
  byElections: "none",
  snap: "none",
  healLiveSeats: false,
});

/** Senate: multi-seat zones sized by `stateSenateSeats`. */
export const NG_SENATE_SPEC = defineChamberSpec({
  chamberId: "senate",
  countryId: "NG",
  electionType: "senate",
  constituencies: "regions",
  seats: {
    kind: "stateField",
    field: "stateSenateSeats",
    enforce: "multiSeat",
    missing: "throw",
  },
  electoralSystem: "plurality",
  cycle: GENERAL_CYCLE,
  gate: "countryLive",
  lateJoiners: "ownCycle",
  openPrimaryImmediately: true,
  byElections: "none",
  snap: "none",
  healLiveSeats: false,
});

/** Governors: one seat per zone. */
export const NG_GOVERNOR_SPEC = defineChamberSpec({
  chamberId: "governor",
  countryId: "NG",
  electionType: "governor",
  constituencies: "regions",
  seats: { kind: "single" },
  electoralSystem: "plurality",
  cycle: GENERAL_CYCLE,
  gate: "countryLive",
  lateJoiners: "ownCycle",
  openPrimaryImmediately: true,
  byElections: "none",
  snap: "none",
  healLiveSeats: false,
});

/** State Houses of Assembly: multi-seat zones sized from the council seat table. */
export const NG_REGIONAL_COUNCIL_SPEC = defineChamberSpec({
  chamberId: "regionalCouncil",
  countryId: "NG",
  electionType: "regionalCouncil",
  constituencies: "regions",
  seats: { kind: "table", table: NG_REGIONAL_COUNCIL_SEATS, missing: "throw" },
  electoralSystem: "plurality",
  cycle: GENERAL_CYCLE,
  gate: "countryLive",
  lateJoiners: "ownCycle",
  openPrimaryImmediately: true,
  byElections: "none",
  snap: "none",
  healLiveSeats: false,
});

/** President: one nationwide seat, resolved by the bespoke federal-character engine. */
export const NG_PRESIDENT_SPEC = defineChamberSpec({
  chamberId: "president",
  countryId: "NG",
  electionType: "president",
  constituencies: "nation",
  seats: { kind: "single" },
  electoralSystem: "twoRound",
  cycle: GENERAL_CYCLE,
  gate: "countryLive",
  lateJoiners: "ownCycle",
  openPrimaryImmediately: true,
  byElections: "none",
  snap: "none",
  healLiveSeats: false,
});

export const NG_CHAMBER_SPECS = [
  NG_HOUSE_SPEC,
  NG_SENATE_SPEC,
  NG_GOVERNOR_SPEC,
  NG_REGIONAL_COUNCIL_SPEC,
  NG_PRESIDENT_SPEC,
] as const;
