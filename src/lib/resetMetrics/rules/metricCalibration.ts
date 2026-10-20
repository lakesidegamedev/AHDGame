/**
 * Metric calibration keeps display scores and modeled responses in matching units.
 * legacyMetricCalibration resolves aliases once; proxyResponseCalibration converts
 * spans and bounds back to the published unit, so score saturation cannot freeze it.
 */
import type { PrimaryMetricDefinition } from "../catalog";
import { getMetricDefinition } from "@/lib/constants/metricDefinitions";
import type { MetricCategoryId } from "@/lib/db/types";
import { metricQualityRange } from "@/lib/corporations/sectorMetricMarginProfiles";

// Published value = offset + scale * legacy value. None of these are new
// empirical calibrations; they are the existing board's unit adapters.
const ALIASES: Readonly<
  Record<string, { category: string; id: string; scale: number; offset: number }>
> = {
  "02": { category: "economic", id: "medianIncome", scale: 1, offset: 0 },
  "12": { category: "education", id: "testPerformance", scale: 1, offset: 0 },
  "16": { category: "healthcare", id: "uninsuredRate", scale: -1, offset: 100 },
  "18": { category: "healthcare", id: "nhsWaitingTime", scale: 1, offset: 0 },
  "32": { category: "publicSafety", id: "crimeRate", scale: 1, offset: 0 },
  "35": { category: "environment", id: "airQuality", scale: -1, offset: 100 },
  "56": { category: "population", id: "dependencyRatio", scale: 100, offset: 0 },
};

export function legacyMetricCalibration(metric: PrimaryMetricDefinition) {
  const [category, id] = metric.path.split(".");
  const adapter = ALIASES[metric.id] ?? { category, id, scale: 1, offset: 0 };
  return {
    ...adapter,
    definition: getMetricDefinition(adapter.category as MetricCategoryId, adapter.id),
  };
}

export function proxyResponseCalibration(
  metric: PrimaryMetricDefinition,
  countryId: string,
  year: number
) {
  const legacy = legacyMetricCalibration(metric);
  const direction =
    metric.interpretation === "higher"
      ? 1
      : metric.interpretation === "lower"
        ? -1
        : legacy.definition
          ? (legacy.definition.isHigherBetter ? 1 : -1) * Math.sign(legacy.scale)
          : -1;
  // These published indexes have their own units rather than legacy test scores,
  // research percentages or housing ratios. Preserve their existing spans.
  if (["12", "15", "24", "58"].includes(metric.id))
    return { span: 100, direction, min: 0, max: metric.id === "58" ? 100 : Infinity };
  if (!legacy.definition) return null;
  const range = metricQualityRange(legacy.definition, legacy.id, { countryId, year });
  const ends = [legacy.definition.minValue ?? 0, legacy.definition.maxValue ?? 100].map(
    (v) => legacy.offset + legacy.scale * v
  );
  return {
    span: Math.abs(legacy.scale) * (range.max - range.min),
    direction,
    min: Math.min(...ends),
    max: Math.max(...ends),
  };
}
