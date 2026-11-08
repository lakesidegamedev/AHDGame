import { defineChamberSpec } from "@/lib/turn/perpetualElections/chamberSpec";

/** Vouli ton Ellinon: multi-seat regions sized by `houseDistricts`. */
export const GR_LOWER_CHAMBER_SPEC = defineChamberSpec({
  chamberId: "vouli",
  countryId: "GR",
  electionType: "vouli",
  constituencies: "regions",
  seats: { kind: "stateField", field: "houseDistricts", missing: "throw" },
  electoralSystem: "list",
  cycle: { anchor: "grVouli", periodHours: 192 },
  gate: "countryLive",
  lateJoiners: "ownCycle",
  openPrimaryImmediately: true,
  byElections: "none",
  snap: "shiftsCycle",
  healLiveSeats: false,
});
