import type { Db } from "mongodb";
import type { CountryId } from "@/lib/constants/countries";
import { loadDemocraticCompetition } from "@/lib/governanceStyle/loadCompetition";
import { primaryMetrics } from "./catalog";
import { resetMetricConditionScore } from "./conditionScore";
import { readResetMetricBoard } from "./readBoard";
import { readNationalMetricRollup } from "./readNationalRollup";
import { RESET_V2_READY } from "@/lib/resetVersions/availability";
import { gameStateCollection } from "@/lib/db/repositories/gameState";
import {
  RESET_DEMOCRATIC_HEALTH_METRIC_IDS,
  scoreResetGovernanceStyle,
} from "./rules/governanceStyle";

export type ResetDemocraticHealthRead =
  /** The country does not run v2 metrics; callers use the political board. */
  | { status: "not_v2" }
  /** V2 country whose board cannot be read this turn. */
  | { status: "unavailable" }
  | { status: "ready"; value: number };

/**
 * The national Democratic Health a v2 country shows on its metrics page.
 *
 * In a v2 world the political board is not where a v2 country's laws are
 * delivered, so its institutional families decay toward their residuals and
 * read far below the country's real condition. Every consequence of the score
 * (GDP drag, sovereign spread, presidential vote pressure) must read the same
 * v2 value the player sees.
 */
export async function readResetDemocraticHealth(
  db: Db,
  countryId: string
): Promise<ResetDemocraticHealthRead> {
  const board = await readResetMetricBoard(db, countryId, undefined, RESET_V2_READY, {
    acceptStale: true,
  });
  if (board.status === "not_enabled") return { status: "not_v2" };
  if (board.status !== "ready") return { status: "unavailable" };
  const observations = await readNationalMetricRollup(db, board.board);
  if (!observations) return { status: "unavailable" };

  const wanted = new Set<string>(RESET_DEMOCRATIC_HEALTH_METRIC_IDS);
  const conditionScores: Record<string, number | null> = {};
  for (const definition of primaryMetrics) {
    if (!wanted.has(definition.id)) continue;
    conditionScores[definition.id] = resetMetricConditionScore(
      definition,
      observations[definition.id]?.value ?? null,
      countryId as Parameters<typeof resetMetricConditionScore>[2],
      board.year
    );
  }
  const gameState = await gameStateCollection(db).findOne(
    { _id: "current" },
    { projection: { preset: 1, presidentialTenureByCountry: 1 } }
  );
  const competition = await loadDemocraticCompetition(
    db,
    countryId as CountryId,
    gameState?.preset,
    gameState
  );
  const score = scoreResetGovernanceStyle({
    conditionScores,
    legislativePositions: [],
    competition,
  });
  return { status: "ready", value: score.democraticHealth.value };
}
