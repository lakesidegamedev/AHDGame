import type { CountryElections } from "../contract";
import type { CountryElectionPhaseEntry } from "@/lib/turn/countryPhases";
import { ensureTRElections, ensureTRSenateElections } from "@/lib/elections/scheduling";

/**
 * SERVER ONLY: spawners reach getDb.
 * No `spawn` and nothing relocated: Turkey is absent from SPAWN_ELECTIONS_REGISTRY;
 * these phases run via COUNTRY_ELECTION_PHASES in order. A `spawn` would run them twice
 * per turn. Spawners stay put because their files are shared across countries.
 * No `seats`: apportionment reads from live regions (no seat table exists).
 */
const phases: CountryElectionPhaseEntry[] = [
  { name: "trElections", fn: ensureTRElections },
  { name: "trSenateElections", fn: ensureTRSenateElections },
];

export const TR_ELECTIONS: CountryElections = {
  electionPhases: phases,
};
