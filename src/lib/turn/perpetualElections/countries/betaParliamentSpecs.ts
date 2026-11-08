import { defineChamberSpec } from "../chamberSpec";

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
