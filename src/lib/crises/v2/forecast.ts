import { computeSeverityStep, forecastInaction } from "./severity";
import type { CrisisDefinition, CrisisInstance } from "./types";

/** Turns shown in the "if nobody acts" projection. */
export const FORECAST_HORIZON_TURNS = 6;

type ForecastInstance = Pick<
  CrisisInstance,
  "stage" | "severity" | "idleTurns" | "leverLastUsed" | "severityHistory" | "ledger"
>;

const OBSERVED_INPUT = "observed";

/** Same model with every driver replaced by one input that carries the observed pressure. */
function withObservedDriver(def: CrisisDefinition): CrisisDefinition {
  return {
    ...def,
    severity: {
      ...def.severity,
      drivers: [{ id: OBSERVED_INPUT, input: OBSERVED_INPUT, coefficient: 1 }],
    },
  };
}

/**
 * Severity pressure the sim added on the last evaluated turn: what moved
 * severity beyond stage decay, inaction escalation and the levers that counted.
 * The live driver inputs are not stored, so this is read back from the history.
 */
export function estimateDriverPressure(def: CrisisDefinition, instance: ForecastInstance): number {
  const history = instance.severityHistory;
  if (history.length < 2) return 0;
  const last = history[history.length - 1];
  const prev = history[history.length - 2];
  const mitigation = instance.ledger
    .filter((row) => row.turn === last.turn && row.leverId !== null)
    .reduce((sum, row) => sum + row.mitigation, 0);
  const baseline = computeSeverityStep(
    {
      stage: instance.stage,
      severity: prev.severity,
      idleTurns: Math.max(0, instance.idleTurns - 1),
      leverLastUsed: {},
    },
    { ...def, severity: { ...def.severity, drivers: [] } },
    { turn: last.turn, driverInputs: {}, leverUses: [] }
  ).after;
  return last.severity - baseline + mitigation;
}

/**
 * Projected severity for the next turns if nobody pulls a lever, holding the
 * latest observed pressure steady and the stage fixed. An estimate, not a
 * promise: stage changes and new inputs will move the real path.
 */
export function forecastDoNothing(
  def: CrisisDefinition,
  instance: ForecastInstance,
  turn: number,
  horizonTurns = FORECAST_HORIZON_TURNS
): number[] {
  const pressure = estimateDriverPressure(def, instance);
  return forecastInaction(
    instance,
    withObservedDriver(def),
    { [OBSERVED_INPUT]: pressure },
    turn,
    horizonTurns
  ).map((value) => Math.round(value * 10) / 10);
}

export type SeverityTrend = "rising" | "falling" | "steady";

/** Direction over the last few samples; moves under one point count as steady. */
export function severityTrend(samples: readonly number[], window = 3): SeverityTrend {
  if (samples.length < 2) return "steady";
  const recent = samples.slice(-window - 1);
  const delta = recent[recent.length - 1] - recent[0];
  if (delta >= 1) return "rising";
  if (delta <= -1) return "falling";
  return "steady";
}
