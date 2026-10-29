/** Recovery may advance an existing fallback proxy, never a measured or definition-v2 owner. */
import type { ResetMetricSnapshot } from "@/lib/resetMetrics/rules/snapshot";
import { primaryMetricById } from "@/lib/resetMetrics/catalog";
import { driftProxyValue } from "@/lib/resetMetrics/rules/policyDrift";
import { resetMetricConditionScore } from "@/lib/resetMetrics/conditionScore";
const MAX_CATCH_UP_CONDITION_POINTS = 2;
// These owners fail closed in collectResetMetricOwnerReadings; recovery must do the same.
const MEASURED_OWNER_IDS = new Set([
  "01",
  "03",
  "05",
  "06",
  "07",
  "08",
  "09",
  "10",
  "16",
  "18",
  "20",
  "54",
  "55",
  "56",
  "57",
]);
export function legacyProxyCatchUp(input: {
  board: ResetMetricSnapshot;
  metricId: string;
  pressure: number;
  verifiedTurns: number;
  year: number;
}): { before: number; after: number; conditionDelta: number } | null {
  const { board, metricId, year } = input;
  const metric = primaryMetricById(metricId);
  const observed = board.observations[metricId];
  const opening = board.openingValues?.[metricId] ?? board.history?.[metricId]?.[0]?.value;
  if (
    !metric ||
    MEASURED_OWNER_IDS.has(metricId) ||
    observed?.status !== "proxy" ||
    observed.definitionVersion === 2 ||
    !/^(game outcome owner:|provisional continuity owner:)/.test(observed.source) ||
    typeof observed.value !== "number" ||
    typeof opening !== "number" ||
    !Number.isFinite(opening) ||
    !Number.isFinite(input.pressure) ||
    input.pressure <= 0 ||
    !Number.isInteger(input.verifiedTurns) ||
    input.verifiedTurns < 1
  )
    return null;
  const before = observed.value;
  const score = resetMetricConditionScore(metric, before, board.countryId, year);
  if (score === null) return null;
  let projected = before;
  let baseline = before;
  for (let i = 0; i < Math.min(48, input.verifiedTurns); i++) {
    const common = { metric, openingValue: opening, countryId: board.countryId, year };
    projected = driftProxyValue({
      ...common,
      currentValue: projected,
      pressure: Math.min(1.2, input.pressure),
    });
    baseline = driftProxyValue({ ...common, currentValue: baseline, pressure: 0 });
  }
  // Credit only the marginal law effect, not a natural rebound toward the opening baseline.
  let after = before + projected - baseline;
  const projectedScore = resetMetricConditionScore(metric, projected, board.countryId, year);
  const candidateScore = resetMetricConditionScore(metric, after, board.countryId, year);
  if (projectedScore !== null && candidateScore !== null && candidateScore > projectedScore)
    after = projected;
  let nextScore = resetMetricConditionScore(metric, after, board.countryId, year);
  if (nextScore === null || nextScore <= score) return null;
  if (nextScore - score > MAX_CATCH_UP_CONDITION_POINTS) {
    let low = 0,
      high = 1;
    for (let i = 0; i < 48; i++) {
      const fraction = (low + high) / 2;
      const candidate = before + (after - before) * fraction;
      const s = resetMetricConditionScore(metric, candidate, board.countryId, year);
      if (s !== null && s - score <= MAX_CATCH_UP_CONDITION_POINTS) low = fraction;
      else high = fraction;
    }
    after = before + (after - before) * low;
    nextScore = resetMetricConditionScore(metric, after, board.countryId, year);
  }
  if (nextScore === null || nextScore <= score) return null;
  return { before, after, conditionDelta: nextScore - score };
}
