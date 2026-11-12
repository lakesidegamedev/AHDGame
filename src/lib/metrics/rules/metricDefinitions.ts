import type { MetricCategoryId } from "@/lib/db/types";
import {
  metricCategories,
  type MetricCountryCode,
  type MetricCountryScopeSetting,
  type MetricCategory,
  type MetricDefinition,
} from "@/lib/constants/metricDefinitionsTables";

/** Resolve the human-readable name for a metric, honouring per-region overrides
 *  when a stateId is supplied. Falls back to `definition.name`. */
export function getMetricDisplayName(definition: MetricDefinition, stateId?: string): string {
  if (stateId && definition.regionDisplayNames) {
    const override = definition.regionDisplayNames[stateId.toUpperCase()];
    if (override) return override;
  }
  return definition.name;
}

// Country dashboards now use one uniform metric catalog. `countryId` is kept in
// the signature for compatibility with seed scripts and UI callers.
export function getMetricsForCountry(_countryId: MetricCountryCode): MetricCategory[] {
  return metricCategories.map((cat) => ({
    ...cat,
    metrics: [...cat.metrics],
  }));
}

// Helper to get metric definition by category and metric ID
export function getMetricDefinition(
  categoryId: MetricCategoryId,
  metricId: string
): MetricDefinition | undefined {
  const category = metricCategories.find((c) => c.id === categoryId);
  return category?.metrics.find((m) => m.id === metricId);
}

// Helper to get category by ID
export function getMetricCategory(categoryId: MetricCategoryId): MetricCategory | undefined {
  return metricCategories.find((c) => c.id === categoryId);
}

// Helper to format a metric value for display
export function formatMetricValue(value: number, definition: MetricDefinition): string {
  const decimals = definition.decimals ?? 0;
  const formatted = value.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
  return `${definition.formatPrefix || ""}${formatted}${definition.formatSuffix || ""}`;
}

// Display-layer helpers
// These let UI consumers treat this module as the single source of truth for
// metric presentation: `MetricsCategoryDisplay`, the region metric detail page,
// and the national metrics dashboard all import from here.

/**
 * Flat-by-category view of all metric definitions, keyed as
 * `definitions[categoryId][metricId]`. Built once at module load from
 * `metricCategories`. Consumers that previously kept their own nested copy
 * (see `MetricsCategoryDisplay.tsx`, the region metric detail page) should
 * use this instead.
 */
export const METRIC_DEFS_BY_CATEGORY: Record<
  MetricCategoryId,
  Record<string, MetricDefinition>
> = metricCategories.reduce(
  (acc, cat) => {
    const catMap: Record<string, MetricDefinition> = {};
    for (const metric of cat.metrics) catMap[metric.id] = metric;
    acc[cat.id] = catMap;
    return acc;
  },
  {} as Record<MetricCategoryId, Record<string, MetricDefinition>>
);

function findMetricDefinition(metricId: string): MetricDefinition | undefined {
  for (const cat of metricCategories) {
    const found = cat.metrics.find((m) => m.id === metricId);
    if (found) return found;
  }
  return undefined;
}

/** Short display name (falls back to full name). */
export function getMetricShortName(metricId: string): string | undefined {
  const def = findMetricDefinition(metricId);
  return def?.shortName ?? def?.name;
}

/** Full display name. */
export function getMetricName(metricId: string): string | undefined {
  return findMetricDefinition(metricId)?.name;
}

/** Long directional description (falls back to `description`). */
export function getMetricDetailedDescription(metricId: string): string | undefined {
  const def = findMetricDefinition(metricId);
  return def?.detailedDescription ?? def?.description;
}

/** @deprecated The metric catalog is now uniform across countries. */
export function getMetricCountryScope(metricId: string): MetricCountryScopeSetting | undefined {
  void metricId;
  return undefined;
}

// Flat maps derived at module load (drop-in replacements for the former
// per-metric constant maps).

function buildFlatMap<T>(select: (def: MetricDefinition) => T | undefined): Record<string, T> {
  const out: Record<string, T> = {};
  for (const cat of metricCategories) {
    for (const metric of cat.metrics) {
      const value = select(metric);
      if (value !== undefined) out[metric.id] = value;
    }
  }
  return out;
}

/** Map of metricId -> short display name (falls back to full name). */
export const METRIC_NAMES: Record<string, string> = buildFlatMap((d) => d.shortName ?? d.name);

/** Map of metricId -> detailed directional description. */
export const METRIC_DESCRIPTIONS: Record<string, string> = buildFlatMap(
  (d) => d.detailedDescription ?? d.description
);
