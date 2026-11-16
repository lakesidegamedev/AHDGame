import type { CountryElections } from "../contract";
import type { CountryElectionPhaseEntry } from "@/lib/turn/countryPhases";
import { ensureSecededChamberElections } from "@/lib/elections/scheduling/shared";
import { RTX_REGIONAL_COUNCIL_SEATS } from "./data/rtxRegions";

/**
 * Texas's elections. SERVER ONLY: spawners reach `getDb`.
 *
 * Every phase is a no-op until independence stands Texas's regions up; the
 * first races are opened directly by the secession, and these keep the
 * House, prefect and council cycles running after that.
 */

export async function ensureRTXElections(now: Date, inFlightTurn?: number): Promise<void> {
  await ensureSecededChamberElections("RTX", "rtxAssembly", now, undefined, inFlightTurn);
}

export async function ensureRTXCommissionerElections(
  now: Date,
  inFlightTurn?: number
): Promise<void> {
  await ensureSecededChamberElections("RTX", "governor", now, { seatsPerRegion: 1 }, inFlightTurn);
}

export async function ensureRTXRegionalCouncilElections(
  now: Date,
  inFlightTurn?: number
): Promise<void> {
  await ensureSecededChamberElections(
    "RTX",
    "regionalCouncil",
    now,
    { seatsByRegion: { ...RTX_REGIONAL_COUNCIL_SEATS } },
    inFlightTurn
  );
}

const phases: CountryElectionPhaseEntry[] = [
  { name: "rtxElections", fn: ensureRTXElections },
  { name: "rtxCommissionerElections", fn: ensureRTXCommissionerElections },
  { name: "rtxRegionalCouncilElections", fn: ensureRTXRegionalCouncilElections },
];

export const RTX_ELECTIONS: CountryElections = {
  electionPhases: phases,
};
