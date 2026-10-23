/**
 * State metric baselines are the values metrics decay toward without policy changes.
 * toStateMetricBaseline copies current values into the baseline's ten categories.
 */
import type { MetricCategoryId, StateMetrics, StateMetricValue } from "@/lib/db/types/stateMetrics";
import type { StateMetricBaseline } from "@/lib/db/types/statePolicy";

function flattenCategory(
  category: Partial<Record<string, StateMetricValue>>
): Record<string, number> {
  const result: Record<string, number> = {};
  for (const [key, metric] of Object.entries(category)) {
    if (metric) result[key] = metric.value;
  }
  return result;
}

export function toStateMetricBaseline(metrics: StateMetrics): StateMetricBaseline {
  const categories: MetricCategoryId[] = [
    "economic",
    "education",
    "healthcare",
    "infrastructure",
    "publicSafety",
    "environment",
    "social",
    "governance",
    "population",
    "mediaInformation",
  ];

  const baselines: Record<string, Record<string, number>> = {};
  for (const cat of categories) {
    baselines[cat] = flattenCategory(metrics[cat] as Record<string, StateMetricValue>);
  }

  return { _id: metrics._id, baselines };
}
