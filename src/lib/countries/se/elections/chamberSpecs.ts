import { defineChamberSpec } from "@/lib/turn/perpetualElections/chamberSpec";

/** Riksdag: list-PR regions sized by `houseDistricts` (the Second Chamber in the earliest era). */
export const SE_LOWER_CHAMBER_SPEC = defineChamberSpec({
  chamberId: "riksdag",
  countryId: "SE",
  electionType: "riksdag",
  constituencies: "regions",
  seats: { kind: "stateField", field: "houseDistricts", missing: "throw" },
  electoralSystem: "list",
  cycle: { anchor: "seRiksdag", periodHours: 192 },
  gate: "countryLive",
  lateJoiners: "ownCycle",
  openPrimaryImmediately: true,
  byElections: "none",
  snap: "shiftsCycle",
  healLiveSeats: false,
});
