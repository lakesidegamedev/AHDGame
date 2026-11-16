import type { CountryElections } from "../contract";
import type { CountryElectionPhaseEntry } from "@/lib/turn/countryPhases";
import { ensureSecededChamberElections } from "@/lib/elections/scheduling/shared";
import { NEN_REGIONAL_COUNCIL_SEATS } from "./data/nenRegions";

/**
 * New England's elections. SERVER ONLY: spawners reach `getDb`.
 *
 * Every phase is a no-op until independence stands New England's regions up; the
 * first races are opened directly by the secession, and these keep the
 * Assembly, prefect and council cycles running after that.
 */

export async function ensureNENElections(now: Date, inFlightTurn?: number): Promise<void> {
  await ensureSecededChamberElections("NEN", "nenAssembly", now, undefined, inFlightTurn);
}

export async function ensureNENCommissionerElections(
  now: Date,
  inFlightTurn?: number
): Promise<void> {
  await ensureSecededChamberElections("NEN", "governor", now, { seatsPerRegion: 1 }, inFlightTurn);
}

export async function ensureNENRegionalCouncilElections(
  now: Date,
  inFlightTurn?: number
): Promise<void> {
  await ensureSecededChamberElections(
    "NEN",
    "regionalCouncil",
    now,
    { seatsByRegion: { ...NEN_REGIONAL_COUNCIL_SEATS } },
    inFlightTurn
  );
}

const phases: CountryElectionPhaseEntry[] = [
  { name: "nenElections", fn: ensureNENElections },
  { name: "nenCommissionerElections", fn: ensureNENCommissionerElections },
  { name: "nenRegionalCouncilElections", fn: ensureNENRegionalCouncilElections },
];

export const NEN_ELECTIONS: CountryElections = {
  electionPhases: phases,
};
