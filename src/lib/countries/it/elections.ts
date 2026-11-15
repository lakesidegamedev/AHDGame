import type { CountryElections } from "../contract";
import type { CountryElectionPhaseEntry } from "@/lib/turn/countryPhases";
import { ensureITElections, ensureITSenateElections } from "@/lib/elections/scheduling";

/**
 * Italy's elections. SERVER ONLY (spawners reach getDb).
 * No `spawn`: Italy has no SPAWN_ELECTIONS_REGISTRY row; phases run through COUNTRY_ELECTION_PHASES in this order, and adding a spawn would run them twice per turn.
 * No `seats`: apportionment is read from live regions (as East Germany's Volkskammer and Brazil's Senate); an empty byChamber would mean a chamber with no seats.
 */
const phases: CountryElectionPhaseEntry[] = [
  { name: "itElections", fn: ensureITElections },
  { name: "itSenateElections", fn: ensureITSenateElections },
];

export const IT_ELECTIONS: CountryElections = {
  electionPhases: phases,
};
