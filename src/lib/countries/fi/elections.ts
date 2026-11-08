import type { CountryElections } from "../contract";
import type { CountryElectionPhaseEntry } from "@/lib/turn/countryPhases";
import { ensureFIElections } from "@/lib/turn/perpetualElections";

/**
 * Server only: spawners reach getDb.
 * No spawn: phases run via COUNTRY_ELECTION_PHASES; adding spawn would rerun them.
 * Shared spawner files stay put to avoid affecting other countries.
 * No seats: apportionment is read from live regions.
 */
const phases: CountryElectionPhaseEntry[] = [{ name: "fiElections", fn: ensureFIElections }];

export const FI_ELECTIONS: CountryElections = {
  electionPhases: phases,
};
