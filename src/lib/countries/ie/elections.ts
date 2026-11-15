import type { MajorDefaultParty } from "@/lib/seeds/defaultPartyTiers";
import type { CountryElections } from "../contract";
import type { CountryElectionPhaseEntry } from "@/lib/turn/countryPhases";
import type { SpawnElectionsResult } from "@/lib/elections/scheduling/registry";
import { IE_DAIL_SEATS_PER_REGION } from "@/lib/seeds/ie/ieRegions";
import { IE_LOCAL_COUNCIL_SEATS } from "@/lib/elections/scheduling/shared";
import {
  ensureIECathaoirleachElections,
  ensureIEElections,
  ensureIELocalCouncilElections,
  ensureIEUachtaranElections,
} from "./elections/perpetual";

const sum = (table: Readonly<Record<string, number>>): number =>
  Object.values(table).reduce((a, b) => a + b, 0);

/**
 * Ireland's elections.
 *
 * SERVER ONLY: spawners reach `getDb`.
 *
 * Totals are summed from the tables, not declared as constants. A hand-written
 * `160` would be a second source that silently drifts when a constituency
 * moves.
 *
 * The council total is 295, but only 200 seats are in play; the extra 95 are
 * NIR seats that exist only on reunification. Report the standing chamber
 * separately from reunification seats.
 */
/*
 * ⚠️ `currentTurn` IS THE IN-FLIGHT TURN AND MUST BE THREADED. The turn
 * processor spawns elections before the turn counter is persisted, so a
 * spawner that reads the stored turn instead lands a cycle one turn late.
 * Upstream added this parameter to every `ensure*` spawner and to
 * `SpawnElectionsHandler`; the registry now forwards to this function, so
 * dropping it here would silently undo that for this country.
 */
const spawn = async (now: Date, currentTurn?: number): Promise<SpawnElectionsResult> => {
  await ensureIEElections(now, currentTurn);
  await ensureIEUachtaranElections(now, currentTurn);
  await ensureIELocalCouncilElections(now, currentTurn);
  await ensureIECathaoirleachElections(now, currentTurn);
  return {
    message: "IE Dáil, Uachtarán, Local Council, and Cathaoirleach continuity check complete.",
  };
};

const { NIR: NIR_COUNCIL_SEATS, ...COUNCIL_SEATS_EXCLUDING_NIR } = IE_LOCAL_COUNCIL_SEATS;

/**
 * Election turn phases, in the order `countryPhases.ts` declares them.
 *
 * Distinct from `spawn`: `spawn` is the perpetual-election continuity check,
 * these are turn phases. The harness compares this list against
 * `COUNTRY_ELECTION_PHASES` entry by entry, `fn` by reference.
 */
const phases: CountryElectionPhaseEntry[] = [
  { name: "ieElections", fn: ensureIEElections },
  { name: "ieUachtaranElections", fn: ensureIEUachtaranElections },
  { name: "ieLocalCouncilElections", fn: ensureIELocalCouncilElections },
  { name: "ieCathaoirleachElections", fn: ensureIECathaoirleachElections },
];

/** Default parties that seed as Major; every other default party seeds Minor. */
const majorDefaultParties: MajorDefaultParty[] = [{ abbr: "FF" }, { abbr: "FG" }, { abbr: "SF" }];

export const IE_ELECTIONS: CountryElections = {
  majorDefaultParties: majorDefaultParties,
  electionPhases: phases,
  spawn,
  seats: {
    byChamber: {
      dail: IE_DAIL_SEATS_PER_REGION,
      localCouncil: IE_LOCAL_COUNCIL_SEATS,
    },
    totals: {
      dail: sum(IE_DAIL_SEATS_PER_REGION),
      localCouncil: sum(COUNCIL_SEATS_EXCLUDING_NIR),
      localCouncilAfterReunification: sum(IE_LOCAL_COUNCIL_SEATS),
      northernIrelandCouncil: NIR_COUNCIL_SEATS,
    },
  },
};

export {
  ensureIECathaoirleachElections,
  ensureIEElections,
  ensureIELocalCouncilElections,
  ensureIEUachtaranElections,
};
