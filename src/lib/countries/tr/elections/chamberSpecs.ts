import { defineChamberSpec } from "@/lib/turn/perpetualElections/chamberSpec";

/** Grand National Assembly: multi-seat regions sized by `houseDistricts`. */
export const TR_LOWER_CHAMBER_SPEC = defineChamberSpec({
  chamberId: "milletMeclisi",
  countryId: "TR",
  electionType: "milletMeclisi",
  constituencies: "regions",
  seats: { kind: "stateField", field: "houseDistricts", missing: "throw" },
  electoralSystem: "list",
  cycle: { anchor: "trMeclis", periodHours: 192 },
  gate: "countryLive",
  lateJoiners: "ownCycle",
  openPrimaryImmediately: true,
  byElections: "none",
  snap: "shiftsCycle",
  healLiveSeats: false,
});
