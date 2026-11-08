import { JP_PARTY_TIERS } from "@/lib/countries/jp/data/jpPartyTiers";
import type { CountryElectionPhaseEntry } from "@/lib/turn/countryPhases";
import type { SpawnElectionsResult } from "@/lib/turn/perpetualElections/registry";
import type { CountryElections } from "../contract";
import {
  ensureJPCouncillorElections,
  ensureJPElections,
  ensureJPGovernorElections,
  ensureJPRegionalCouncilElections,
} from "./elections/perpetual";
import {
  JP_GOVERNOR_SEATS as governorSeats,
  JP_SANGIIN_SEATS as sangiinSeats,
  JP_SHUGIIN_SEATS as shugiinSeats,
} from "./data/jpSeats";

/**
 * SERVER ONLY. Importing from a client component pulls the DB driver
 * into the browser bundle via ./elections/perpetual. Not re-exported
 * from ../jp/index.ts.
 *
 * Functions are composed by IMPORT, never by literal: toEqual compares
 * functions by reference, so a re-export passes tautologically and a
 * re-declaration fails despite identical behavior. MOVED_THUNK_REGISTRIES
 * pins them by resolved behavior.
 */

/**
 * Japan's chamber seat tables, imported from `jp/data/jpSeats.ts` so they stay
 * the same objects as `constants/states.ts` rather than copied values that
 * silently diverge.
 */

/**
 * The continuity spawner. Shugiin (lower), Sangiin (upper, natural class), and
 * prefectural Governor seats.
 *
 * ⚠️ Regional Council is NOT spawned here. It runs as its own election phase
 * (COUNTRY_ELECTION_PHASES) and mirrors live Shugiin timing; the phases execute
 * concurrently via Promise.all, so ordering is best-effort.
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
  await ensureJPElections(now, currentTurn);
  await ensureJPCouncillorElections(now, undefined, currentTurn);
  await ensureJPGovernorElections(now, currentTurn);
  return { message: "JP Shugiin / Sangiin / Governor continuity check complete." };
};

/** The four election phases, in the order countryPhases.ts declares them. */
const phases: CountryElectionPhaseEntry[] = [
  { name: "jpElections", fn: ensureJPElections },
  // Regional Council mirrors live Shugiin timing. Listed after jpElections by
  // convention (UK/DE pairs do the same), but these phases run concurrently
  // via Promise.all, so the order is best-effort, not a guarantee: when a
  // concurrently-created Shugiin race isn't yet visible (clean roll-over /
  // bootstrap), the spawner's fallback recomputes the identical Shugiin
  // canonical cycle, so the council still aligns with the Shugiin.
  { name: "jpRegionalCouncilElections", fn: ensureJPRegionalCouncilElections },
  /*
   * ⚠️ WRAPPED, NOT PASSED DIRECTLY. `ensureJPCouncillorElections` takes
   * `(now, classOverride, inFlightTurn)`, but a phase `fn` is called as
   * `(gameNow, currentTurn)`. Handing the bare function over puts the TURN
   * NUMBER into `classOverride`, which expects 1 | 2 -- so the Sangiin spawner
   * would filter on a nonexistent class and silently spawn nothing.
   */
  {
    name: "jpCouncillorElections",
    fn: (gameNow, currentTurn) => ensureJPCouncillorElections(gameNow, undefined, currentTurn),
  },
  { name: "jpGovernorElections", fn: ensureJPGovernorElections },
];

export const JP_ELECTIONS: CountryElections = {
  majorDefaultParties: JP_PARTY_TIERS,
  spawn,
  electionPhases: phases,
  seats: {
    byChamber: {
      shugiin: shugiinSeats,
      sangiin: sangiinSeats,
      governor: governorSeats,
    },
    totals: {
      shugiin: 465,
      sangiin: 248,
      governor: 8,
    },
  },
};

export {
  ensureJPCouncillorElections,
  ensureJPElections,
  ensureJPGovernorElections,
  ensureJPRegionalCouncilElections,
};
