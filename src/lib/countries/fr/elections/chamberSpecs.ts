import { defineChamberSpec } from "@/lib/turn/perpetualElections/chamberSpec";

/** Assemblée nationale: two-round constituencies sized by each region's seeded `houseDistricts`. */
export const FR_LOWER_CHAMBER_SPEC = defineChamberSpec({
  chamberId: "assembleeNationale",
  countryId: "FR",
  electionType: "assembleeNationale",
  constituencies: "regions",
  seats: { kind: "stateField", field: "houseDistricts", missing: "throw" },
  electoralSystem: "twoRound",
  cycle: { anchor: "frAssembly", periodHours: 240 },
  gate: "countryLive",
  lateJoiners: "ownCycle",
  openPrimaryImmediately: true,
  byElections: "none",
  snap: "shiftsCycle",
  healLiveSeats: false,
});
