import type { CountryElections } from "../contract";
import type { CountryElectionPhaseEntry } from "@/lib/turn/countryPhases";
import { ensureBALElections } from "@/lib/elections/scheduling";

/**
 * The Baltic States's elections.
 *
 * SERVER ONLY. The spawners reach `getDb`.
 *
 * NO `spawn`, AND NOTHING RELOCATED. The Baltic States has no row in
 * `SPAWN_ELECTIONS_REGISTRY`; these phases run through
 * `COUNTRY_ELECTION_PHASES`, in this order. Adding a `spawn` would run them a
 * second time each turn. Spawner files are shared between countries, so moving
 * one here would take the others' elections with it.
 *
 * NO `seats`. There is no seat table for the Baltic States; apportionment is
 * read from the live regions, as with East Germany's Volkskammer and Brazil's
 * Senate. An empty `byChamber` would describe a chamber with no seats rather
 * than one whose seats live elsewhere.
 */
const phases: CountryElectionPhaseEntry[] = [
  { name: "balSupremeSovietElections", fn: ensureBALElections },
];

export const BAL_ELECTIONS: CountryElections = {
  electionPhases: phases,
};
