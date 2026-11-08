import { defineChamberSpec } from "@/lib/turn/perpetualElections/chamberSpec";

/** Congreso de los Diputados: provincial lists sized by `houseDistricts`; no cycle in eras without free elections. */
export const ES_LOWER_CHAMBER_SPEC = defineChamberSpec({
  chamberId: "congresoDiputados",
  countryId: "ES",
  electionType: "congresoDiputados",
  constituencies: "regions",
  seats: { kind: "stateField", field: "houseDistricts", missing: "throw" },
  electoralSystem: "list",
  cycle: { anchor: "esCongreso", periodHours: 192 },
  gate: "countryLive",
  lateJoiners: "ownCycle",
  openPrimaryImmediately: true,
  byElections: "none",
  snap: "shiftsCycle",
  healLiveSeats: false,
});
