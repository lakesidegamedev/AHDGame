import type { MajorDefaultParty } from "@/lib/seeds/defaultPartyTiers";
import type { CountryElections } from "../contract";
import type { CountryElectionPhaseEntry } from "@/lib/turn/countryPhases";
import type { SpawnElectionsResult } from "@/lib/elections/scheduling/registry";
import {
  CN_NPC_SEATS,
  CN_NPC_SEATS_1953,
  CN_PEOPLES_CONGRESS_SEATS,
  CN_PEOPLES_CONGRESS_SEATS_1953,
  TOTAL_CN_NPC_SEATS,
  TOTAL_CN_NPC_SEATS_1953,
  TOTAL_CN_PEOPLES_CONGRESS_SEATS,
  TOTAL_CN_PEOPLES_CONGRESS_SEATS_1953,
} from "@/lib/constants/states";
import {
  ensureCNElections,
  ensureCNGovernorElections,
  ensureCNPeoplesCongressElections,
} from "./elections/perpetual";

/**
 * China's elections.
 *
 * SERVER ONLY: the spawners reach `getDb`.
 *
 * Seat tables are imported, not declared, so there is no second source to
 * diverge; they stay in `constants/states.ts` because that file is still
 * multi-country.
 *
 * Both eras are listed because China's chambers change size and neither table
 * is "the" table. The NPC is 2,980 seats modern / 1,226 in 1953; Provincial
 * People's Congresses are 4,000 / 3,781. `getCnNpcSeats` picks by preset.
 * `byChamber` has one slot per chamber, so the honest encoding is one entry
 * per chamber-era rather than silently describing 1953 with the modern table.
 *
 * No governor seat table, deliberately: governors are one office per region
 * rather than a chamber, so there is no per-region seat count to carry;
 * `ensureCNGovernorElections` works off the region roster.
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
  await ensureCNElections(now, currentTurn);
  await ensureCNPeoplesCongressElections(now, currentTurn);
  await ensureCNGovernorElections(now, currentTurn);
  return { message: "CN NPC / Provincial Congress / Governor continuity check complete." };
};

/**
 * The election phases, in the order `countryPhases.ts` declares them.
 *
 * `spawn` and `electionPhases` are different lists and this country has both.
 * `spawn` is the continuity check the perpetual-election registry runs; these
 * are the turn phases. The harness compares this list against
 * `COUNTRY_ELECTION_PHASES` entry by entry, `fn` by reference.
 */
const phases: CountryElectionPhaseEntry[] = [
  { name: "cnElections", fn: ensureCNElections },
  { name: "cnPeoplesCongressElections", fn: ensureCNPeoplesCongressElections },
  { name: "cnGovernorElections", fn: ensureCNGovernorElections },
];

/** Default parties that seed as Major; every other default party seeds Minor. */
const majorDefaultParties: MajorDefaultParty[] = [{ abbr: "CCP" }];

export const CN_ELECTIONS: CountryElections = {
  majorDefaultParties: majorDefaultParties,
  electionPhases: phases,
  spawn,
  seats: {
    byChamber: {
      npc: CN_NPC_SEATS,
      npc1953: CN_NPC_SEATS_1953,
      peoplesCongress: CN_PEOPLES_CONGRESS_SEATS,
      peoplesCongress1953: CN_PEOPLES_CONGRESS_SEATS_1953,
    },
    totals: {
      npc: TOTAL_CN_NPC_SEATS,
      npc1953: TOTAL_CN_NPC_SEATS_1953,
      peoplesCongress: TOTAL_CN_PEOPLES_CONGRESS_SEATS,
      peoplesCongress1953: TOTAL_CN_PEOPLES_CONGRESS_SEATS_1953,
    },
  },
};

export { ensureCNElections, ensureCNGovernorElections, ensureCNPeoplesCongressElections };
