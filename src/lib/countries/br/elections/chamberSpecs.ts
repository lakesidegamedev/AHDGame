import { defineChamberSpec } from "@/lib/elections/scheduling/chamberSpec";

/** Câmara dos Deputados: one multi-seat race per macro-region, sized by `houseDistricts`. */
export const BR_CHAMBER_SPEC = defineChamberSpec({
  chamberId: "chamber",
  countryId: "BR",
  electionType: "chamber",
  constituencies: "regions",
  seats: { kind: "stateField", field: "houseDistricts", enforce: "positive", missing: "throw" },
  electoralSystem: "list",
  cycle: { anchor: "brChamber", periodHours: 192 },
  gate: "always",
  lateJoiners: "ownCycle",
  openPrimaryImmediately: true,
  byElections: "none",
  snap: "none",
  healLiveSeats: true,
});

/** Federal Senate: every seat in a region renews together, sized by `stateSenateSeats`. */
export const BR_SENATE_SPEC = defineChamberSpec({
  chamberId: "senate",
  countryId: "BR",
  electionType: "senate",
  constituencies: "regions",
  seats: { kind: "stateField", field: "stateSenateSeats", enforce: "positive", missing: "throw" },
  electoralSystem: "plurality",
  cycle: { anchor: "brSenate", periodHours: 192 },
  gate: "always",
  lateJoiners: "ownCycle",
  openPrimaryImmediately: true,
  byElections: "none",
  snap: "none",
  healLiveSeats: true,
});

/** Macro-region executives, riding the general election. */
export const BR_GOVERNOR_SPEC = defineChamberSpec({
  chamberId: "governor",
  countryId: "BR",
  electionType: "governor",
  constituencies: "regions",
  seats: { kind: "single", forceSeat: true },
  electoralSystem: "plurality",
  cycle: { anchor: "brChamber", periodHours: 192 },
  gate: "always",
  lateJoiners: "mirrorLivePeer",
  openPrimaryImmediately: true,
  byElections: "none",
  snap: "none",
  healLiveSeats: false,
});

export const BR_CHAMBER_SPECS = [BR_CHAMBER_SPEC, BR_SENATE_SPEC, BR_GOVERNOR_SPEC] as const;
