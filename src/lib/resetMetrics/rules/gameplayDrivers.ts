/**
 * Game outcome estimates respond to livelihoods, production and delivered services.
 * gameplayMetricPressure supplies a bounded, lagged channel alongside funded law
 * delivery. It never replaces counted outcomes, legal rights or event measurements.
 */
import { primaryMetricById } from "../catalog";
import { resetMetricConditionScore, type ResetMetricScoreCountry } from "../conditionScore";
import type { ResetMetricSnapshot } from "./snapshot";

// Explicit balance assumptions, not empirical causal estimates. Weights sum to
// at most 0.5 per destination, limiting feedback between model families. One
// condition point upstream contributes its weight in downstream target points.
// Do not add income -> legal rights, migration volume -> integration, or
// enforcement -> corruption detection shortcuts here.
export const GAMEPLAY_METRIC_DRIVERS: Readonly<
  Record<string, readonly (readonly [string, number])[]>
> = {
  "11": [
    ["03", 0.15],
    ["42", 0.15],
    ["16", 0.1],
  ],
  "12": [
    ["11", 0.2],
    ["42", 0.1],
    ["16", 0.1],
  ],
  "13": [
    ["11", 0.15],
    ["12", 0.15],
    ["14", 0.1],
  ],
  "14": [
    ["03", 0.15],
    ["12", 0.15],
  ],
  "15": [
    ["13", 0.15],
    ["14", 0.15],
    ["28", 0.1],
  ],
  "17": [
    ["02", 0.2],
    ["03", 0.1],
    ["16", 0.1],
  ],
  "21": [
    ["16", 0.2],
    ["18", 0.1],
    ["03", 0.1],
  ],
  "22": [
    ["16", 0.15],
    ["18", 0.15],
  ],
  "23": [
    ["28", 0.1],
    ["29", 0.1],
    ["30", 0.1],
  ],
  "26": [["05", 0.1]],
  "27": [
    ["26", 0.15],
    ["30", 0.1],
  ],
  "28": [
    ["30", 0.15],
    ["02", 0.1],
  ],
  "29": [
    ["30", 0.15],
    ["26", 0.1],
  ],
  "30": [["26", 0.1]],
  "31": [
    ["01", 0.2],
    ["03", 0.15],
    ["43", 0.1],
  ],
  "32": [
    ["01", 0.2],
    ["03", 0.15],
  ],
  "34": [
    ["01", 0.2],
    ["41", 0.15],
    ["13", 0.1],
  ],
  "35": [
    ["36", 0.2],
    ["37", 0.1],
  ],
  "36": [
    ["05", -0.15],
    ["06", 0.1],
    ["37", 0.15],
  ],
  "37": [
    ["30", 0.1],
    ["15", 0.1],
  ],
  "38": [
    ["26", 0.1],
    ["29", 0.1],
    ["23", 0.15],
  ],
  "40": [
    ["01", 0.15],
    ["13", 0.15],
    ["03", 0.1],
  ],
  "43": [
    ["01", 0.1],
    ["03", 0.1],
    ["31", 0.1],
    ["49", 0.1],
  ],
  "44": [
    ["49", 0.15],
    ["01", 0.1],
  ],
  "46": [
    ["01", 0.15],
    ["24", 0.1],
    ["13", 0.1],
  ],
  "47": [["28", 0.1]],
  "48": [["47", 0.2]],
  "52": [
    ["50", 0.15],
    ["47", 0.1],
  ],
  "53": [
    ["12", 0.15],
    ["52", 0.15],
    ["28", 0.1],
  ],
};

/** Definitions with new units must never be compared with old opening values. */
export function compatibleConditionChange(
  board: ResetMetricSnapshot,
  id: string,
  countryId: ResetMetricScoreCountry,
  year: number
): number | null {
  const observation = board.observations[id],
    metric = primaryMetricById(id);
  if (
    !metric ||
    observation?.value == null ||
    !Number.isFinite(observation.value) ||
    observation.status === "unavailable"
  )
    return null;
  const reference = board.gameplayReferences?.[id];
  const base =
    observation.definitionVersion === 2
      ? reference?.definitionVersion === 2 && reference.unit === observation.unit
        ? reference.value
        : board.history?.[id]?.find((p) => p.definitionVersion === 2 && p.unit === observation.unit)
            ?.value
      : (board.openingValues?.[id] ?? board.history?.[id]?.[0]?.value);
  if (!Number.isFinite(base)) return null;
  // These definitions do not share legacy scoring units. Use bounded relative
  // movement instead of interpreting currency or payment shares as old indexes.
  if (observation.definitionVersion === 2 && ["02", "03", "24", "41"].includes(id)) {
    if (base! <= 0) return null;
    const direction = ["03", "24", "41"].includes(id) ? -1 : 1;
    return Math.max(-50, Math.min(50, direction * 100 * (observation.value / base! - 1)));
  }
  const before = resetMetricConditionScore(metric, base!, countryId, year);
  const after = resetMetricConditionScore(metric, observation.value, countryId, year);
  return before === null || after === null ? null : Math.max(-50, Math.min(50, after - before));
}

export function gameplayMetricPressure(
  board: ResetMetricSnapshot,
  year: number
): Record<string, number> {
  const changes = new Map<string, number | null>();
  const result: Record<string, number> = {};
  for (const [target, drivers] of Object.entries(GAMEPLAY_METRIC_DRIVERS)) {
    let points = 0;
    for (const [source, weight] of drivers) {
      if (!changes.has(source))
        changes.set(source, compatibleConditionChange(board, source, board.countryId, year));
      points += (changes.get(source) ?? 0) * weight;
    }
    // policyDriftTarget converts normalized pressure to 25 condition points.
    if (points !== 0) result[target] = Math.max(-0.5, Math.min(0.5, points / 25));
  }
  return result;
}
