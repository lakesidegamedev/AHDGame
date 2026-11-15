import type { CountryElections } from "../contract";
import type { CountryElectionPhaseEntry } from "@/lib/turn/countryPhases";
import { ensureSEElections } from "@/lib/elections/scheduling";

/**
 * Sweden's elections.
 *
 * SERVER ONLY: spawners reach `getDb`.
 *
 * NO `spawn`: Sweden has no `SPAWN_ELECTIONS_REGISTRY` row; these phases run via
 * `COUNTRY_ELECTION_PHASES`. Adding a `spawn` would run them twice per turn.
 * Spawner fns stay where they are because their files are shared across
 * countries.
 *
 * NO `seats`: there is no seat table; apportionment reads from live regions.
 * An empty `byChamber` would describe a chamber with no seats.
 */
const phases: CountryElectionPhaseEntry[] = [{ name: "seElections", fn: ensureSEElections }];

export const SE_ELECTIONS: CountryElections = {
  electionPhases: phases,
};
