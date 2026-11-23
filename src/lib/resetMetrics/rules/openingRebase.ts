/**
 * Rebase a live regional board onto corrected opening data: swap the opening
 * and move the current value and history by the same relation, so movement
 * since the opening is kept. Rates rebase proportionally; indexes and shares
 * additively within bounds. Owner-measured, economy-owned, election and
 * v2-definition metrics are never touched.
 */
import { primaryMetricById } from "../catalog";
import type { ResetMetricSnapshot } from "./snapshot";

/** Measured or owner-computed metrics whose opening is not a seed estimate. */
const NEVER_REBASE = new Set([
  "01",
  "02",
  "03",
  "04",
  "05",
  "06",
  "07",
  "08",
  "09",
  "10",
  "20",
  "24",
  "25",
  "41",
  "51",
  "54",
  "55",
  "56",
  "57",
  "58",
]);

/** Rates and per-person amounts: a corrected opening rescales the whole series. */
const PROPORTIONAL = new Set(["19", "31", "32", "33", "36", "42"]);

export interface MetricRebase {
  metricId: string;
  mode: "proportional" | "additive";
  oldOpening: number;
  newOpening: number;
  oldCurrent: number;
  newCurrent: number;
}

function bounded(metricId: string, value: number): number {
  const unit = primaryMetricById(metricId)?.unit ?? "";
  const upper = unit.includes("%") || unit.includes("index") ? 100 : Infinity;
  return Number(Math.max(0, Math.min(upper, value)).toFixed(6));
}

export function planOpeningRebase(
  board: Pick<ResetMetricSnapshot, "openingValues" | "observations">,
  corrected: Readonly<Record<string, number>>
): MetricRebase[] {
  const plan: MetricRebase[] = [];
  for (const [metricId, newOpening] of Object.entries(corrected)) {
    if (NEVER_REBASE.has(metricId) || !Number.isFinite(newOpening)) continue;
    const observation = board.observations[metricId];
    const oldOpening = board.openingValues?.[metricId];
    if (
      !observation ||
      observation.definitionVersion === 2 ||
      observation.status !== "proxy" ||
      typeof observation.value !== "number" ||
      !Number.isFinite(observation.value) ||
      typeof oldOpening !== "number" ||
      !Number.isFinite(oldOpening) ||
      Math.abs(newOpening - oldOpening) < 1e-6
    )
      continue;
    const proportional = PROPORTIONAL.has(metricId) && oldOpening > 0;
    plan.push({
      metricId,
      mode: proportional ? "proportional" : "additive",
      oldOpening,
      newOpening,
      oldCurrent: observation.value,
      newCurrent: rebaseValue(metricId, observation.value, oldOpening, newOpening, proportional),
    });
  }
  return plan;
}

function rebaseValue(
  metricId: string,
  value: number,
  oldOpening: number,
  newOpening: number,
  proportional: boolean
): number {
  return bounded(
    metricId,
    proportional ? (value * newOpening) / oldOpening : value + (newOpening - oldOpening)
  );
}

/** Mongo $set for one board; history and prior values move with the opening. */
export function openingRebaseUpdate(
  board: Pick<ResetMetricSnapshot, "history" | "priorValues">,
  plan: readonly MetricRebase[]
): Record<string, unknown> {
  const set: Record<string, unknown> = {};
  for (const row of plan) {
    const proportional = row.mode === "proportional";
    const move = (value: number) =>
      rebaseValue(row.metricId, value, row.oldOpening, row.newOpening, proportional);
    set[`openingValues.${row.metricId}`] = row.newOpening;
    set[`observations.${row.metricId}.value`] = row.newCurrent;
    const prior = board.priorValues?.[row.metricId];
    if (typeof prior === "number" && Number.isFinite(prior))
      set[`priorValues.${row.metricId}`] = move(prior);
    const history = board.history?.[row.metricId];
    if (history?.length)
      set[`history.${row.metricId}`] = history.map((point) =>
        point.definitionVersion === 2 ? point : { ...point, value: move(point.value) }
      );
  }
  return set;
}
