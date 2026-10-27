import { type CountryId } from "@/lib/constants/countriesCore";
import {
  getMetricCategory,
  getMetricDefinition,
  formatMetricValue,
} from "@/lib/constants/metricDefinitions";
import type { MetricFilter } from "./components/GlobeMetricPanel";
import type { WorldMetricsData } from "./WorldMetricFilterContext";

/**
 * Per-nation one-line summary for the active globe metric filter.
 *
 * Split from `worldMetricHighlight.ts`, which the globe tooltip uses and which
 * carries the country registry and availability rules. The nation table only
 * needs this formatter, so importing it here keeps that registry out of the
 * eager /world graph while the globe (a dynamic chunk) still has it.
 */
const METRIC_SHORT: Record<string, string> = {
  unemploymentRate: "Unemployment",
  medianIncome: "Median income",
  gdpGrowth: "GDP growth",
  povertyRate: "Poverty",
  costOfLiving: "Cost of living",
};

export function getMetricFilterHighlight(
  filter: MetricFilter,
  countryId: CountryId,
  isoCode: string | undefined,
  worldMetrics: WorldMetricsData | null,
  partyData: Record<string, { partyName: string; partyColor: string; count: number }>,
  corpsData: { countries: Record<string, { count: number }> } | null
): { label: string; value: string } | null {
  if (filter.type === "none" || !isoCode) return null;

  if (filter.type === "party") {
    const p = partyData[isoCode];
    if (!p?.partyName) return null;
    return { label: "Largest party", value: p.partyName };
  }

  if (filter.type === "corps") {
    const n = corpsData?.countries[isoCode]?.count;
    if (n === undefined || n <= 0) return null;
    return {
      label: "Corporations",
      value: `${n} registered`,
    };
  }

  const country = worldMetrics?.countries[isoCode];
  if (!country?.hasData) return null;

  if (filter.type === "overall") {
    if (country.overallScore === null) return null;
    return { label: "Overall score", value: String(country.overallScore) };
  }

  if (filter.type === "category") {
    const s = country.categoryScores[filter.categoryId];
    if (s === null || s === undefined) return null;
    const name = getMetricCategory(filter.categoryId)?.name ?? filter.categoryId;
    return { label: `${name} score`, value: String(s) };
  }

  if (filter.type === "metric") {
    const entry = country.categories[filter.categoryId]?.[filter.metricId];
    if (!entry) return null;
    const def = getMetricDefinition(filter.categoryId, filter.metricId);
    const valueStr = def
      ? formatMetricValue(entry.value, def)
      : String(
          Math.abs(entry.value) >= 100 ? Math.round(entry.value) : Number(entry.value.toFixed(1))
        );
    const metricLabel =
      def?.name ??
      METRIC_SHORT[filter.metricId] ??
      filter.metricId.replace(/([A-Z])/g, " $1").trim();
    return { label: metricLabel, value: valueStr };
  }

  return null;
}
