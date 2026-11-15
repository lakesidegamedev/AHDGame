import type { CountryElections } from "../contract";
import type { CountryElectionPhaseEntry } from "@/lib/turn/countryPhases";
import {
  ensureDDGovernorElections,
  ensureDDLandAssemblyElections,
  ensureDDVolkskammerElections,
} from "./elections/perpetual";

/**
 * East Germany's elections.
 *
 * ⚠️ SERVER ONLY. The spawners reach `getDb`.
 *
 * ⚠️ NO `spawn` AND NO `seats`, AND BOTH ABSENCES ARE REAL.
 *
 * The three spawners run as election phases via COUNTRY_ELECTION_PHASES,
 * and Land assemblies must spawn before governors so the First Secretary
 * queue has legislature NPPs to sponsor. Adding `spawn` would run them
 * twice per turn, in the wrong order.
 *
 * Apportionment is read from live regions every turn:
 * `ensureDDVolkskammerElections` uses `seatsFromRegionField(regions,
 * "houseDistricts")` and Land assemblies use `stateSenateSeats`. An empty
 * `byChamber` would falsely describe a chamber with no seats.
 */
const phases: CountryElectionPhaseEntry[] = [
  { name: "ddVolkskammerElections", fn: ensureDDVolkskammerElections },
  { name: "ddLandAssemblyElections", fn: ensureDDLandAssemblyElections },
  { name: "ddGovernorElections", fn: ensureDDGovernorElections },
];

export const DD_ELECTIONS: CountryElections = {
  electionPhases: phases,
};

export { ensureDDGovernorElections, ensureDDLandAssemblyElections, ensureDDVolkskammerElections };
