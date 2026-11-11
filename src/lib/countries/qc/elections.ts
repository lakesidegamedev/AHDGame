import type { CountryElections } from "../contract";
import type { CountryElectionPhaseEntry } from "@/lib/turn/countryPhases";
import { ensureSecededChamberElections } from "@/lib/elections/scheduling/shared";
import { QC_REGIONAL_COUNCIL_SEATS } from "./data/qcRegions";

/**
 * Quebec's elections. SERVER ONLY: spawners reach `getDb`.
 *
 * Every phase is a no-op until independence stands Quebec's regions up; the
 * first races are opened directly by the secession, and these keep the
 * National Assembly, prefect and council cycles running after that.
 */

export async function ensureQCElections(now: Date, inFlightTurn?: number): Promise<void> {
  await ensureSecededChamberElections("QC", "qcAssembly", now, undefined, inFlightTurn);
}

export async function ensureQCPrefectElections(now: Date, inFlightTurn?: number): Promise<void> {
  await ensureSecededChamberElections("QC", "governor", now, { seatsPerRegion: 1 }, inFlightTurn);
}

export async function ensureQCRegionalCouncilElections(
  now: Date,
  inFlightTurn?: number
): Promise<void> {
  await ensureSecededChamberElections(
    "QC",
    "regionalCouncil",
    now,
    { seatsByRegion: { ...QC_REGIONAL_COUNCIL_SEATS } },
    inFlightTurn
  );
}

const phases: CountryElectionPhaseEntry[] = [
  { name: "qcElections", fn: ensureQCElections },
  { name: "qcPrefectElections", fn: ensureQCPrefectElections },
  { name: "qcRegionalCouncilElections", fn: ensureQCRegionalCouncilElections },
];

export const QC_ELECTIONS: CountryElections = {
  electionPhases: phases,
};
