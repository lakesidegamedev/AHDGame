import { defineChamberSpec } from "@/lib/turn/perpetualElections/chamberSpec";

/** Camera dei Deputati: multi-seat regions sized by each region's seeded `houseDistricts`. */
export const IT_LOWER_CHAMBER_SPEC = defineChamberSpec({
  chamberId: "cameraDeputati",
  countryId: "IT",
  electionType: "cameraDeputati",
  constituencies: "regions",
  seats: { kind: "stateField", field: "houseDistricts", missing: "throw" },
  electoralSystem: "list",
  cycle: { anchor: "itCamera", periodHours: 240 },
  gate: "countryLive",
  lateJoiners: "ownCycle",
  openPrimaryImmediately: true,
  byElections: "none",
  snap: "shiftsCycle",
  healLiveSeats: false,
});
