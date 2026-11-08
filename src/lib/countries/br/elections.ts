import { seedPresetsFrom } from "@/lib/constants/turnTime";
import type { MajorDefaultParty } from "@/lib/seeds/defaultPartyTiers";
import type { CountryElections } from "../contract";
import type { CountryElectionPhaseEntry } from "@/lib/turn/countryPhases";
import type { SpawnElectionsResult } from "@/lib/turn/perpetualElections/registry";
import { BR_SEATS_PER_REGION } from "@/lib/seeds/br/brRegions";
import {
  ensureBRElections,
  ensureBRSenateElections,
  ensureBRGovernorElections,
  ensureBRPresidentialElection,
} from "./elections/perpetual";

/**
 * Brazil's elections.
 *
 * SERVER ONLY. The spawners reach `getDb`.
 *
 * Chamber of Deputies has a denormalised table that must agree with
 * `brRegions[*].houseDistricts` (fixed at 513 seats). The Senate has none by
 * design: its seats are `brRegions[*].stateSenateSeats`, read live.
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
  await ensureBRElections(now, currentTurn);
  await ensureBRSenateElections(now, currentTurn);
  await ensureBRGovernorElections(now, currentTurn);
  await ensureBRPresidentialElection(now, currentTurn);
  return { message: "BR Câmara / Senate / regional executive continuity check complete." };
};

/**
 * The election phases, in the order `countryPhases.ts` declares them.
 *
 * `spawn` and `electionPhases` are different lists and this country has both.
 * `spawn` is the continuity check the perpetual-election registry runs; these
 * are the turn phases. The harness compares this list against
 * `COUNTRY_ELECTION_PHASES` entry by entry, `fn` by reference.
 */
const phases: CountryElectionPhaseEntry[] = [
  { name: "brElections", fn: ensureBRElections },
  { name: "brSenateElections", fn: ensureBRSenateElections },
  { name: "brGovernorElections", fn: ensureBRGovernorElections },
  { name: "brPresidentialElection", fn: ensureBRPresidentialElection },
];

/** Default parties that seed as Major; every other default party seeds Minor. */
const majorDefaultParties: MajorDefaultParty[] = [
  { abbr: "PMDB" },
  { abbr: "PFL" },
  { abbr: "PT", presets: seedPresetsFrom("2019-default") },
  { abbr: "PL" },
];

export const BR_ELECTIONS: CountryElections = {
  majorDefaultParties: majorDefaultParties,
  electionPhases: phases,
  spawn,
  seats: {
    byChamber: { camara: BR_SEATS_PER_REGION },
    totals: { camara: Object.values(BR_SEATS_PER_REGION).reduce((a, b) => a + b, 0) },
  },
};

export { ensureBRElections, ensureBRSenateElections };
