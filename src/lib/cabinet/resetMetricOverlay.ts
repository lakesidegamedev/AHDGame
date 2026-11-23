import type { Db } from "mongodb";
import type { GameState } from "@/lib/db/types/gameState";
import type { StateMetrics } from "@/lib/db/types/stateMetrics";
import { RESET_V2_READY } from "@/lib/resetVersions/availability";
import { isResetV2Country, resetSystemVersionsForCountry } from "@/lib/resetVersions/rules";
import { resetMetricSnapshotsCollection } from "@/lib/db/repositories/resetMetricSnapshots";
import { readNationalMetricRollup } from "@/lib/resetMetrics/readNationalRollup";
import {
  normalizeNationalMetricBoard,
  type ResetMetricSnapshot,
} from "@/lib/resetMetrics/rules/snapshot";
import type { OpeningMetricObservation } from "@/lib/resetMetrics/rules/openingObservation";
import { observedMetricValues } from "@/lib/resetMetrics/rules/approval";

/** `{ category: { metricId: value } }`, the shape the overlay writes into a legacy doc. */
export type MetricValuesByPath = Record<string, Record<string, number>>;

export interface ResetMetricDisplay {
  national: MetricValuesByPath | null;
  regional: Map<string, MetricValuesByPath>;
}

/**
 * Metrics v2 readings for the cabinet stat strip, or null when the country is
 * not on Metrics v2 in this world.
 *
 * A v2 world keeps its live indicators in `resetMetricSnapshots`. The legacy
 * store the strip reads is empty for countries that joined only in v2 (Canada
 * in 2027) and stale for the rest, so the strip showed dashes or old numbers.
 * The national figure is the full rollup (regional readings weighted the same
 * way as the v2 national view) with the national board's own owners on top.
 */
export async function loadResetMetricDisplay(
  db: Db,
  gameState: GameState | null,
  countryId: string
): Promise<ResetMetricDisplay | null> {
  if (
    !gameState?.resetWorldId ||
    !isResetV2Country(countryId) ||
    resetSystemVersionsForCountry(gameState, RESET_V2_READY, countryId).metrics !== "v2"
  ) {
    return null;
  }
  const boards = await resetMetricSnapshotsCollection<ResetMetricSnapshot>(db)
    .find(
      { worldId: gameState.resetWorldId, countryId },
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
    )
    .toArray();
  if (boards.length === 0) return null;

  const regional = new Map<string, MetricValuesByPath>();
  let national: MetricValuesByPath | null = null;
  for (const board of boards) {
    if (board.scope === "regional" && board.regionId) {
      regional.set(board.regionId, observedMetricValues(board.observations ?? {}));
    }
  }
  const nationalBoard = boards.find((board) => board.scope === "national");
  if (nationalBoard) {
    const normalized = normalizeNationalMetricBoard(nationalBoard);
    const rollup: Record<string, OpeningMetricObservation> | null = await readNationalMetricRollup(
      db,
      normalized
    ).catch(() => null);
    national = observedMetricValues(rollup ?? normalized.observations ?? {});
  }
  return { national, regional };
}

/**
 * Lay v2 readings over a legacy metric doc. A v2 reading wins for its path;
 * legacy-only paths keep their legacy value. Returns a new doc.
 */
export function overlayMetricValues(
  base: StateMetrics | null,
  id: string,
  values: MetricValuesByPath | null | undefined
): StateMetrics | null {
  if (!values || Object.keys(values).length === 0) return base;
  const out: Record<string, unknown> = base
    ? { ...(base as unknown as Record<string, unknown>) }
    : { _id: id };
  for (const [category, metrics] of Object.entries(values)) {
    const merged: Record<string, unknown> = {
      ...((out[category] as Record<string, unknown> | undefined) ?? {}),
    };
    for (const [metricId, value] of Object.entries(metrics)) {
      merged[metricId] = { value };
    }
    out[category] = merged;
  }
  return out as unknown as StateMetrics;
}
