/**
 * Metric catalog tables live in metricDefinitionsTables and the lookup helpers in
 * metrics/rules/metricDefinitions. This module forwards both so existing imports
 * keep working.
 */
import { metricCategories } from "./metricDefinitionsTables";

export * from "./metricDefinitionsTables";
export {
  getMetricDisplayName,
  getMetricsForCountry,
  getMetricDefinition,
  getMetricCategory,
  formatMetricValue,
  getMetricShortName,
  getMetricName,
  getMetricDetailedDescription,
  getMetricCountryScope,
  METRIC_DEFS_BY_CATEGORY,
  METRIC_NAMES,
  METRIC_DESCRIPTIONS,
} from "@/lib/metrics/rules/metricDefinitions";

export default metricCategories;
