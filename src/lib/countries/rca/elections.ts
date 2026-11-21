import type { CountryElections } from "../contract";
import type { CountryElectionPhaseEntry } from "@/lib/turn/countryPhases";
import { ensureSecededChamberElections } from "@/lib/elections/scheduling/shared";
import { RCA_REGIONAL_COUNCIL_SEATS } from "./data/rcaRegions";

/**
 * California's elections. SERVER ONLY: spawners reach `getDb`.
 *
 * Every phase is a no-op until independence stands California's regions up; the
 * first races are opened directly by the secession, and these keep the
 * Assembly, prefect and council cycles running after that.
 */

export async function ensureRCAElections(now: Date, inFlightTurn?: number): Promise<void> {
  await ensureSecededChamberElections("RCA", "rcaAssembly", now, undefined, inFlightTurn);
}

export async function ensureRCACommissionerElections(
  now: Date,
  inFlightTurn?: number
): Promise<void> {
  await ensureSecededChamberElections("RCA", "governor", now, { seatsPerRegion: 1 }, inFlightTurn);
}

export async function ensureRCARegionalCouncilElections(
  now: Date,
  inFlightTurn?: number
): Promise<void> {
  await ensureSecededChamberElections(
    "RCA",
    "regionalCouncil",
    now,
    { seatsByRegion: { ...RCA_REGIONAL_COUNCIL_SEATS } },
    inFlightTurn
  );
}

const phases: CountryElectionPhaseEntry[] = [
  { name: "rcaElections", fn: ensureRCAElections },
  { name: "rcaCommissionerElections", fn: ensureRCACommissionerElections },
  { name: "rcaRegionalCouncilElections", fn: ensureRCARegionalCouncilElections },
];

export const RCA_ELECTIONS: CountryElections = {
  electionPhases: phases,
};
