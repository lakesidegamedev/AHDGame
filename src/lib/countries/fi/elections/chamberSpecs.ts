import { defineChamberSpec } from "@/lib/turn/perpetualElections/chamberSpec";

/** Eduskunta: open-list districts sized by `houseDistricts`. */
export const FI_LOWER_CHAMBER_SPEC = defineChamberSpec({
  chamberId: "eduskunta",
  countryId: "FI",
  electionType: "eduskunta",
  constituencies: "regions",
  seats: { kind: "stateField", field: "houseDistricts", missing: "throw" },
  electoralSystem: "list",
  cycle: { anchor: "fiEduskunta", periodHours: 192 },
  gate: "countryLive",
  lateJoiners: "ownCycle",
  openPrimaryImmediately: true,
  byElections: "none",
  snap: "shiftsCycle",
  healLiveSeats: false,
});
