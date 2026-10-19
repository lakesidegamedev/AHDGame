import { primaryMetrics } from "../catalog";
import type { OpeningMetricObservation } from "./openingObservation";
import { openingMetricHistory, validateMetricHistory, type ResetMetricHistory } from "./history";
import type { ResetCountry } from "@/lib/resetLegislation/fundingOwner";

export interface ResetMetricSnapshot {
  _id: string;
  worldId: string;
  countryId: ResetCountry;
  scope: "national" | "regional";
  regionId?: string;
  sourceTurn: number;
  asOfTurn: number;
  /** Prior observed turn for exact replay after a missed refresh; never fabricated history. */
  lastRefreshFromTurn?: number;
  observations: Record<string, OpeningMetricObservation>;
  history?: ResetMetricHistory;
  /** Immutable policy baseline, independent of the bounded history window. */
  openingValues?: Record<string, number>;
  /** Compact preceding owner values make lagged turn retries deterministic. */
  priorValues?: Record<string, number | null>;
}

/** Validate an entire scoped opening board before any v2 writer can consume it. */
export function buildResetMetricSnapshot(input: {
  worldId: string;
  countryId: ResetMetricSnapshot["countryId"];
  regionId?: string;
  sourceTurn: number;
  observations: Record<string, OpeningMetricObservation>;
  history?: ResetMetricHistory;
}): ResetMetricSnapshot {
  if (!input.worldId || !Number.isSafeInteger(input.sourceTurn) || input.sourceTurn < 1) {
    throw new Error("Reset metric snapshot needs a world id and positive source turn");
  }
  const scope = input.regionId === undefined ? "national" : "regional";
  if (input.regionId === "") throw new Error("Reset metric snapshot has an empty region id");
  const expected = primaryMetrics.filter((metric) =>
    scope === "national" ? metric.aggregation === "national" : metric.aggregation !== "national"
  );
  const expectedIds = new Set(expected.map((metric) => metric.id));
  const actualIds = Object.keys(input.observations);
  if (actualIds.length !== expectedIds.size || actualIds.some((id) => !expectedIds.has(id))) {
    throw new Error(`Reset metric snapshot has an incomplete ${scope} primary board`);
  }
  for (const metric of expected) {
    const observed = input.observations[metric.id];
    if (
      !observed ||
      observed.metricId !== metric.id ||
      observed.path !== metric.path ||
      typeof observed.value !== "number" ||
      !Number.isFinite(observed.value) ||
      observed.status === "unavailable" ||
      !observed.source ||
      !observed.owner ||
      (observed.lastUpdatedTurn !== undefined &&
        (!Number.isSafeInteger(observed.lastUpdatedTurn) ||
          observed.lastUpdatedTurn < input.sourceTurn))
    ) {
      throw new Error(
        `Reset metric ${input.countryId}/${input.regionId ?? "national"}/${metric.id} is not ready`
      );
    }
  }
  const observations = Object.fromEntries(
    expected.map((metric) => [metric.id, input.observations[metric.id]])
  );
  const history = input.history ?? openingMetricHistory(observations, input.sourceTurn);
  validateMetricHistory(history, observations, input.sourceTurn);
  return {
    _id: `${input.countryId}:${input.regionId ?? "national"}`,
    worldId: input.worldId,
    countryId: input.countryId,
    scope,
    ...(input.regionId === undefined ? {} : { regionId: input.regionId }),
    sourceTurn: input.sourceTurn,
    asOfTurn: input.sourceTurn,
    observations,
    history,
  };
}

/** Stable content for a persisted-readback receipt, independent of BSON field order. */
export function resetMetricSnapshotPayload(rows: readonly ResetMetricSnapshot[]): string {
  return JSON.stringify(
    [...rows]
      .sort((a, b) => a._id.localeCompare(b._id))
      .map((row) => [
        row._id,
        row.worldId,
        row.countryId,
        row.scope,
        row.regionId ?? null,
        row.sourceTurn,
        row.asOfTurn,
        Object.entries(row.observations)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([id, observation]) => [
            id,
            observation.metricId,
            observation.path,
            observation.value,
            observation.status,
            observation.source,
            observation.owner,
            observation.note,
            observation.lastUpdatedTurn ?? null,
          ]),
        Object.entries(row.history ?? {})
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([id, series]) => [id, series.map((point) => [point.turn, point.value])]),
        Object.entries(row.openingValues ?? {}).sort(([a], [b]) => a.localeCompare(b)),
      ])
  );
}
