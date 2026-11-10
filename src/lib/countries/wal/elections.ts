import type { CountryElections } from "../contract";
import type { CountryElectionPhaseEntry } from "@/lib/turn/countryPhases";
import {
  ensureWALElections,
  ensureWALGovernorElections,
  ensureWALRegionalCouncilElections,
} from "@/lib/elections/scheduling";

/**
 * Wales's elections.
 *
 * SERVER ONLY: the spawners reach `getDb`.
 *
 * No `spawn` and nothing relocated: Wales has no row in
 * `SPAWN_ELECTIONS_REGISTRY`, so these phases run through
 * `COUNTRY_ELECTION_PHASES`. Adding a `spawn` would run them twice per turn.
 * The spawners stay put because their files are shared between countries.
 *
 * No `seats`: there is no seat table for Wales; apportionment is read from the
 * live regions. An empty `byChamber` would mean a chamber with no seats, not
 * one whose seats live elsewhere.
 */
const phases: CountryElectionPhaseEntry[] = [
  { name: "walElections", fn: ensureWALElections },
  { name: "walGovernorElections", fn: ensureWALGovernorElections },
  { name: "walRegionalCouncilElections", fn: ensureWALRegionalCouncilElections },
];

export const WAL_ELECTIONS: CountryElections = {
  electionPhases: phases,
};
