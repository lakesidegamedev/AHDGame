import { seedPresetsFrom } from "@/lib/constants/turnTime";
import type { MajorDefaultParty } from "@/lib/seeds/defaultPartyTiers";
import type { CountryElections } from "../contract";
import type { CountryElectionPhaseEntry } from "@/lib/turn/countryPhases";
import type { SpawnElectionsResult } from "@/lib/turn/perpetualElections/registry";
import {
  DE_WAHLKREIS_SEATS,
  DE_LANDTAG_SEATS,
  TOTAL_DE_BUNDESTAG_SEATS,
  TOTAL_DE_WAHLKREIS_SEATS,
} from "@/lib/constants/states";
import { ensureDEElections } from "./elections/perpetual";
/*
 * ⚠️ BOTH FROM THE DEFINING MODULE. Importing
 * `ensureDEMinisterPresidentElections` through `./elections/perpetual` gave a
 * DIFFERENT function object from the one `COUNTRY_ELECTION_PHASES` holds --
 * same name, same behaviour, not the same reference -- and the harness compares
 * phase `fn` by reference for exactly that reason.
 */
import {
  ensureDELandtagElections,
  ensureDEMinisterPresidentElections,
} from "./elections/germanyLandtag";

/**
 * Germany's elections. SERVER ONLY: ensureDEElections reaches getDb.
 * Seat tables are imported from constants/states.ts, not declared here.
 * TOTAL_DE_WAHLKREIS_SEATS counts constituency seats;
 * TOTAL_DE_BUNDESTAG_SEATS counts the whole chamber including the list half.
 */
/*
 * ⚠️ `currentTurn` IS THE IN-FLIGHT TURN AND MUST BE THREADED. The turn
 * processor spawns elections before the turn counter is persisted, so a
 * spawner that reads the stored turn instead lands a cycle one turn late.
 * Upstream added this parameter to every `ensure*` spawner and to
 * `SpawnElectionsHandler`; the registry now forwards to this function, so
 * dropping it here would silently undo that for this country.
 */
const spawn = async (now: Date, currentTurn?: number): Promise<SpawnElectionsResult> => {
  await ensureDEElections(now, currentTurn);
  return { message: "DE Bundestag continuity check complete." };
};

/**
 * The election phases, in the order `countryPhases.ts` declares them.
 *
 * `spawn` and `electionPhases` are DIFFERENT lists and this country has
 * both. `spawn` is the continuity check the perpetual-election registry runs;
 * these are the turn phases. They overlap but are not the same set. The
 * harness compares this list against `COUNTRY_ELECTION_PHASES` entry by
 * entry, `fn` by reference.
 */
const phases: CountryElectionPhaseEntry[] = [
  { name: "deElections", fn: ensureDEElections },
  { name: "deLandtagElections", fn: ensureDELandtagElections },
  { name: "deMinisterPresidentElections", fn: ensureDEMinisterPresidentElections },
];

/** Default parties that seed as Major; every other default party seeds Minor. */
const majorDefaultParties: MajorDefaultParty[] = [
  { abbr: "SPD" },
  { abbr: "CDU" },
  { abbr: "GRN", presets: seedPresetsFrom("2019-default") },
];

export const DE_ELECTIONS: CountryElections = {
  majorDefaultParties: majorDefaultParties,
  electionPhases: phases,
  spawn,
  seats: {
    byChamber: {
      wahlkreis: DE_WAHLKREIS_SEATS,
      landtag: DE_LANDTAG_SEATS,
    },
    totals: {
      wahlkreis: TOTAL_DE_WAHLKREIS_SEATS,
      bundestag: TOTAL_DE_BUNDESTAG_SEATS,
    },
  },
};

export { ensureDEElections };
