import type { CountryElections } from "../contract";
import type { CountryElectionPhaseEntry } from "@/lib/turn/countryPhases";
import { RU_NATIONALITIES_SEATS } from "@/lib/constants/ruSeats";
import {
  ensureRUGovernorElections,
  ensureRUNationalitiesElections,
  ensureRURepublicSovietElections,
  ensureRUSupremeSovietElections,
  ensureRUUnionCongressElections,
} from "./elections/perpetual";

/**
 * Russia's elections.
 *
 * Server only: the spawners reach `getDb`.
 *
 * There is no `spawn` because Russia has no row in `SPAWN_ELECTIONS_REGISTRY`.
 * Its four spawners run as election phases through `COUNTRY_ELECTION_PHASES`;
 * adding a `spawn` would create a second execution path and run them twice a
 * turn.
 *
 * There is no union-chamber table because the Soviet of the Union is
 * apportioned from `region.houseDistricts` in the region bundles, and
 * `ruSeats.ts` warns a parallel map would drift. Adding one for symmetry would
 * create the second source that file refuses.
 *
 * The Soviet of Nationalities is republic-weighted: 25 seats per union
 * republic, 11 per autonomous republic, floor of 20 per region. Its 515 total
 * was checked against the sum of the table.
 */
const phases: CountryElectionPhaseEntry[] = [
  { name: "ruSupremeSovietElections", fn: ensureRUSupremeSovietElections },
  { name: "ruNationalitiesElections", fn: ensureRUNationalitiesElections },
  { name: "ruRepublicSovietElections", fn: ensureRURepublicSovietElections },
  { name: "ruGovernorElections", fn: ensureRUGovernorElections },
  { name: "ruUnionCongressElections", fn: ensureRUUnionCongressElections },
];

export const RU_ELECTIONS: CountryElections = {
  electionPhases: phases,
  seats: {
    byChamber: {
      nationalities: RU_NATIONALITIES_SEATS,
    },
    totals: {
      nationalities: Object.values(RU_NATIONALITIES_SEATS).reduce((a, b) => a + b, 0),
    },
  },
};

export {
  ensureRUGovernorElections,
  ensureRUNationalitiesElections,
  ensureRURepublicSovietElections,
  ensureRUSupremeSovietElections,
  ensureRUUnionCongressElections,
};
