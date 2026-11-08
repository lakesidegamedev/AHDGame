import { DE_WAHLKREIS_SEATS } from "@/lib/constants/states";
import { DEFAULT_SEED_PRESET } from "@/lib/constants/seedPreset";
import { defineChamberSpec } from "@/lib/turn/perpetualElections/chamberSpec";
import { getLandtagAnchor } from "../data/deLandtag";

/** Bundestag: one race per Land sized by its Wahlkreise; a called snap moves the next term. */
export const DE_BUNDESTAG_SPEC = defineChamberSpec({
  chamberId: "bundestag",
  countryId: "DE",
  electionType: "bundestag",
  constituencies: "regions",
  seats: { kind: "table", table: DE_WAHLKREIS_SEATS, missing: "throw" },
  electoralSystem: "mixed",
  cycle: { anchor: "deBundestag", periodHours: 192 },
  gate: "always",
  lateJoiners: "ownCycle",
  openPrimaryImmediately: true,
  byElections: "none",
  snap: "shiftsCycle",
  healLiveSeats: false,
});

/** Landtage: one race per Land on a five-year cycle staggered by each Land's own anchor. */
export const DE_LANDTAG_SPEC = defineChamberSpec({
  chamberId: "landtag",
  countryId: "DE",
  electionType: "landtag",
  constituencies: "regions",
  seats: { kind: "stateField", field: "stateSenateSeats", missing: "throw" },
  electoralSystem: "list",
  cycle: { anchor: "deLandtag", periodHours: 240 },
  gate: "always",
  lateJoiners: "ownCycle",
  openPrimaryImmediately: true,
  byElections: "none",
  snap: "none",
  healLiveSeats: false,
  regionAnchor: (land, preset) => getLandtagAnchor(land, preset ?? DEFAULT_SEED_PRESET),
  silent: true,
});

export const DE_CHAMBER_SPECS = [DE_BUNDESTAG_SPEC, DE_LANDTAG_SPEC] as const;
