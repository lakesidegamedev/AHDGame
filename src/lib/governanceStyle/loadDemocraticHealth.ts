import type { Db } from "mongodb";
import type { CountryId } from "@/lib/constants/countries";
import type { GameState } from "@/lib/db/types/gameState";
import type { State } from "@/lib/db/types/state";
import type { PoliticalMetricsDoc } from "@/lib/db/types/politicalMetrics";
import { loadDemocraticCompetition } from "./loadCompetition";
import { scoreGovernanceStyle } from "./score";
import { aggregateNationalPoliticalMetrics } from "@/lib/politicalMetrics/aggregate";
import { statesCollection } from "@/lib/db/repositories/states";
import { politicalMetricsCollection } from "@/lib/db/repositories/politicalMetrics";
import { readResetDemocraticHealth } from "@/lib/resetMetrics/readDemocraticHealth";

type DemocraticHealthGameState =
  Pick<GameState, "preset" | "presidentialTenureByCountry"> | null | undefined;

/**
 * Load the same national Democratic Health score shown by the country's
 * metrics screen (the v2 board for v2 countries, else the political board), without loading the rest of that screen's evidence payload.
 * The election engine consumes this read-only value once per presidential vote
 * turn and applies its own candidate-pressure channel from the snapshot.
 */
export async function loadDemocraticHealth(
  db: Db,
  countryId: CountryId,
  gameState: DemocraticHealthGameState
): Promise<number | null> {
  // A v2 country's laws are delivered on the v2 board, not the political
  // board, so its score comes from v2. An unreadable v2 board is neutral
  // rather than a fallback to the political board, which decays in v2 worlds.
  const v2 = await readResetDemocraticHealth(db, countryId);
  if (v2.status === "ready") return v2.value;
  if (v2.status === "unavailable") return null;

  const [docs, states] = await Promise.all([
    politicalMetricsCollection(db).find({ countryId }).toArray(),
    statesCollection<Pick<State, "_id" | "population">>(db)
      .find({ countryId }, { projection: { _id: 1, population: 1 } })
      .toArray(),
  ]);
  if (docs.length === 0) return null;

  const populationByRegion = new Map(states.map((state) => [state._id, state.population ?? 0]));
  const national = aggregateNationalPoliticalMetrics(docs, populationByRegion);
  const competition = await loadDemocraticCompetition(
    db,
    countryId,
    gameState?.preset,
    gameState ?? null
  );
  return scoreGovernanceStyle(national, competition).democraticHealth.value;
}
