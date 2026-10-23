import type { PrimaryMetricDefinition } from "./catalog";
import { politicalScoreFromLegacyValue } from "@/lib/politicalMetrics/derive/legacyInversion";
import { legacyMetricCalibration } from "./rules/metricCalibration";

export type ResetMetricScoreCountry = "US" | "UK" | "JP" | "IE" | "SCO" | "WAL";

function clampScore(value: number): number {
  return Math.max(0, Math.min(100, value));
}

function linearScore(value: number, worst: number, best: number): number {
  if (!Number.isFinite(value) || best === worst) return 50;
  return clampScore(((value - worst) / (best - worst)) * 100);
}

function preferredBandScore(
  value: number,
  preferredLow: number,
  preferredHigh: number,
  outerLow: number,
  outerHigh: number
): number {
  if (!Number.isFinite(value)) return 50;
  if (value >= preferredLow && value <= preferredHigh) return 100;
  if (value < preferredLow) return linearScore(value, outerLow, preferredLow);
  return linearScore(value, outerHigh, preferredHigh);
}

/**
 * Display-only 0-100 condition normalization for domain summaries.
 *
 * Primary observations retain their real units. This adapter exists only so a
 * domain can summarize unlike measures without averaging dollars, rates, and
 * indexes directly. Most measures reuse the established game quality bands;
 * explicit cases cover the v2 metrics whose units differ from their v1 source.
 */
export function resetMetricConditionScore(
  metric: PrimaryMetricDefinition,
  value: number | null,
  countryId: ResetMetricScoreCountry,
  year: number
): number | null {
  if (value === null || !Number.isFinite(value)) return null;

  switch (metric.id) {
    case "07":
      return preferredBandScore(value, 1, 3, -3, 12);
    case "15":
      return linearScore(value, 50, 150);
    case "24":
      return linearScore(value, 160, 60);
    case "55":
      return preferredBandScore(value, 1.9, 2.3, 0.8, 3.5);
    case "58":
      return linearScore(value, 100, 0);
  }

  const adapter = legacyMetricCalibration(metric);
  const category = adapter.category;
  const metricId = adapter.id;
  if (!category || !metricId) return null;
  const adaptedValue = (value - adapter.offset) / adapter.scale;
  return politicalScoreFromLegacyValue(category, metricId, adaptedValue, countryId, year);
}
