import type { Db } from "mongodb";
import type { GameState } from "@/lib/db/types/gameState";
import { RESET_V2_READY } from "@/lib/resetVersions/availability";
import { resetSystemVersionsForCountry, type ResetV2Readiness } from "@/lib/resetVersions/rules";
import {
  buildResetMetricSnapshot,
  normalizeNationalMetricBoard,
  type ResetMetricSnapshot,
} from "./rules/snapshot";
import { gameStateCollection } from "@/lib/db/repositories/gameState";
import { resetMetricSnapshotsCollection } from "@/lib/db/repositories/resetMetricSnapshots";
import { getStartingYearForPreset } from "@/lib/constants/turnTime";
import { yearOfTurn } from "@/lib/utils/gameDate";

export type ResetMetricBoardRead =
  | { status: "not_enabled" }
  | { status: "missing" | "invalid" | "stale" }
  | { status: "ready"; board: ResetMetricSnapshot; year: number };

/** Fail closed on a missing or outdated v2 board; never substitute a v1 board. */
export async function readResetMetricBoard(
  db: Db,
  countryId: string,
  regionId?: string,
  ready: ResetV2Readiness = RESET_V2_READY
): Promise<ResetMetricBoardRead> {
  const gameState = await gameStateCollection(db).findOne(
    { _id: "current" },
    {
      projection: {
        resetWorldId: 1,
        resetVersionSeeds: 1,
        metricsSystemVersion: 1,
        currentTurn: 1,
        currentYear: 1,
        startingYear: 1,
        preset: 1,
        "preIteration.active": 1,
        preIterationTurns: 1,
      },
    }
  );
  if (resetSystemVersionsForCountry(gameState, ready, countryId).metrics !== "v2") {
    return { status: "not_enabled" };
  }
  const worldId = gameState?.resetWorldId;
  if (typeof worldId !== "string") return { status: "missing" };
  const id = `${countryId}:${regionId ?? "national"}`;
  const stored = await resetMetricSnapshotsCollection<ResetMetricSnapshot>(db).findOne(
    { _id: id, worldId },
    {
      projection: {
        _id: 1,
        worldId: 1,
        countryId: 1,
        scope: 1,
        regionId: 1,
        sourceTurn: 1,
        asOfTurn: 1,
        observations: 1,
      },
    }
  );
  if (!stored) return { status: "missing" };
  const board = normalizeNationalMetricBoard(stored);
  if (
    board.countryId !== countryId ||
    board.regionId !== regionId ||
    board.scope !== (regionId === undefined ? "national" : "regional") ||
    !Number.isSafeInteger(board.asOfTurn) ||
    board.asOfTurn < board.sourceTurn
  ) {
    return { status: "invalid" };
  }
  try {
    buildResetMetricSnapshot({
      worldId,
      countryId: board.countryId,
      regionId,
      sourceTurn: board.sourceTurn,
      observations: board.observations,
    });
  } catch {
    return { status: "invalid" };
  }
  if (board.asOfTurn !== gameState?.currentTurn) return { status: "stale" };
  // Ready boards belong to the current turn, so use the same calendar year as
  // gameplay, including custom reset dates and the founding-phase clock.
  const year =
    gameState?.currentYear ??
    yearOfTurn(
      board.asOfTurn,
      gameState?.startingYear ?? getStartingYearForPreset(gameState?.preset ?? ""),
      {
        preIterationActive: gameState?.preIteration?.active,
        preIterationTurns: gameState?.preIterationTurns,
      }
    );
  return { status: "ready", board, year };
}
