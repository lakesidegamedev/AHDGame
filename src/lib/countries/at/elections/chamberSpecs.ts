import { defineChamberSpec } from "@/lib/turn/perpetualElections/chamberSpec";

/** Nationalrat: list-PR regions sized by `houseDistricts`. */
export const AT_LOWER_CHAMBER_SPEC = defineChamberSpec({
  chamberId: "nationalrat",
  countryId: "AT",
  electionType: "nationalrat",
  constituencies: "regions",
  seats: { kind: "stateField", field: "houseDistricts", missing: "throw" },
  electoralSystem: "list",
  cycle: { anchor: "atNationalrat", periodHours: 192 },
  gate: "countryLive",
  lateJoiners: "ownCycle",
  openPrimaryImmediately: true,
  byElections: "none",
  snap: "shiftsCycle",
  healLiveSeats: false,
});
