import type { CountryElections } from "../contract";
import type { CountryElectionPhaseEntry } from "@/lib/turn/countryPhases";
import { ensureSecededChamberElections } from "@/lib/elections/scheduling/shared";
import { AB_REGIONAL_COUNCIL_SEATS } from "./data/abRegions";

/**
 * Alberta's elections. SERVER ONLY: spawners reach `getDb`.
 *
 * Every phase is a no-op until independence stands Alberta's regions up; the
 * first races are opened directly by the secession, and these keep the
 * National Assembly, prefect and council cycles running after that.
 */

export async function ensureABElections(now: Date, inFlightTurn?: number): Promise<void> {
  await ensureSecededChamberElections("AB", "abAssembly", now, undefined, inFlightTurn);
}

export async function ensureABCommissionerElections(
  now: Date,
  inFlightTurn?: number
): Promise<void> {
  await ensureSecededChamberElections("AB", "governor", now, { seatsPerRegion: 1 }, inFlightTurn);
}

export async function ensureABRegionalCouncilElections(
  now: Date,
  inFlightTurn?: number
): Promise<void> {
  await ensureSecededChamberElections(
    "AB",
    "regionalCouncil",
    now,
    { seatsByRegion: { ...AB_REGIONAL_COUNCIL_SEATS } },
    inFlightTurn
  );
}

const phases: CountryElectionPhaseEntry[] = [
  { name: "abElections", fn: ensureABElections },
  { name: "abCommissionerElections", fn: ensureABCommissionerElections },
  { name: "abRegionalCouncilElections", fn: ensureABRegionalCouncilElections },
];

export const AB_ELECTIONS: CountryElections = {
  electionPhases: phases,
};
