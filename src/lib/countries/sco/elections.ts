import type { CountryElections } from "../contract";
import type { CountryElectionPhaseEntry } from "@/lib/turn/countryPhases";
import {
  ensureSCOElections,
  ensureSCOGovernorElections,
  ensureSCORegionalCouncilElections,
} from "@/lib/turn/perpetualElections";

/**
 * Scotland's elections.
 *
 * SERVER ONLY: spawners reach `getDb`.
 *
 * NO `spawn`: Scotland has no `SPAWN_ELECTIONS_REGISTRY` row; these phases run
 * via `COUNTRY_ELECTION_PHASES`. Adding a `spawn` would run them twice per turn.
 * Spawner fns stay where they are because their files are shared across
 * countries.
 *
 * NO `seats`: there is no seat table; apportionment reads from live regions.
 * An empty `byChamber` would describe a chamber with no seats.
 */
const phases: CountryElectionPhaseEntry[] = [
  { name: "scoElections", fn: ensureSCOElections },
  { name: "scoGovernorElections", fn: ensureSCOGovernorElections },
  { name: "scoRegionalCouncilElections", fn: ensureSCORegionalCouncilElections },
];

export const SCO_ELECTIONS: CountryElections = {
  electionPhases: phases,
};
