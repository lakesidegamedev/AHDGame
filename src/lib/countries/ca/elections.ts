import type { CountryElections } from "../contract";
import type { CountryElectionPhaseEntry } from "@/lib/turn/countryPhases";
import type { SpawnElectionsResult } from "@/lib/elections/scheduling/registry";
import { CA_MAJOR_DEFAULT_PARTIES } from "./data/caParties";
import { CA_COMMONS_SEATS_PER_REGION, CA_SENATE_SEATS_PER_REGION } from "./data/caRegions2027";
import { ensureCAElections, ensureCAPremierElections } from "./elections/perpetual";

const sum = (table: Readonly<Record<string, number>>): number =>
  Object.values(table).reduce((a, b) => a + b, 0);

/**
 * Canada's elections.
 *
 * SERVER ONLY: the spawners reach `getDb`. Totals are summed from the tables,
 * not declared as constants, so a ridings change cannot leave a second figure
 * behind.
 *
 * `currentTurn` is the in-flight turn and must be threaded: the turn processor
 * spawns elections before the turn counter is persisted.
 */
const spawn = async (now: Date, currentTurn?: number): Promise<SpawnElectionsResult> => {
  await ensureCAElections(now, currentTurn);
  await ensureCAPremierElections(now, currentTurn);
  return { message: "CA Commons and Premier continuity check complete." };
};

/** Election turn phases, in the order `countryPhases.ts` declares them. */
const phases: CountryElectionPhaseEntry[] = [
  { name: "caElections", fn: ensureCAElections },
  { name: "caPremierElections", fn: ensureCAPremierElections },
];

export const CA_ELECTIONS: CountryElections = {
  majorDefaultParties: CA_MAJOR_DEFAULT_PARTIES,
  electionPhases: phases,
  spawn,
  seats: {
    byChamber: {
      caCommons: CA_COMMONS_SEATS_PER_REGION,
      caSenate: CA_SENATE_SEATS_PER_REGION,
    },
    totals: {
      caCommons: sum(CA_COMMONS_SEATS_PER_REGION),
      caSenate: sum(CA_SENATE_SEATS_PER_REGION),
    },
  },
};

export { ensureCAElections, ensureCAPremierElections };
