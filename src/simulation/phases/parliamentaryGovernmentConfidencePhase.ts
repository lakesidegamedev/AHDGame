import type { Db } from "mongodb";
import {
  resetCompletedSnapConfidence,
  type CompletedSnapConfidence,
} from "@/lib/turn/snapConfidence";
import { getFullSimulationCountryIds } from "@/lib/country/countryTier";
import { getGameStatePreset } from "@/lib/db/collections/gameState";
import { getParliamentaryCountryIds } from "@/lib/turn/parliamentaryGovernment";
import { tickParliamentaryGovernmentConfidence } from "@/lib/countries/uk/confidence/confidenceGaugeStore";
import { countryHasFeature } from "@/lib/countries/rules/countryFeatures";

/** Tick shared confidence after the parliamentary government has been resolved. */
export async function runParliamentaryGovernmentConfidencePhase(
  db: Db,
  now: Date,
  turn: number,
  completedSnaps: readonly CompletedSnapConfidence[] = []
): Promise<void> {
  const preset = await getGameStatePreset(db);
  // Full-simulation countries only: a background country (#5702) has no
  // politicians, government or legislature for this phase to run.
  const registered = new Set(await getFullSimulationCountryIds(db));
  const countryIds = getParliamentaryCountryIds(preset).filter(
    (countryId) => !countryHasFeature("ukTurn", countryId) && registered.has(countryId)
  );

  try {
    await tickParliamentaryGovernmentConfidence(db, { countryIds, now, turn, preset });
  } catch (error) {
    console.error("[turn] parliamentary government confidence tick failed:", error);
  }
  // UK's legacy gauge and every shared tick have already run. End the election turn at 50.
  await resetCompletedSnapConfidence(db, completedSnaps, now);
}
