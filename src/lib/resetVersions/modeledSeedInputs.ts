/** Legacy-shaped seed observations used before the macro/political storage split. */
import type { StateMetrics } from "@/lib/db/types/stateMetrics";
import { US_GEOGRAPHY } from "@/lib/countries/us/geography";
import { UK_GEOGRAPHY } from "@/lib/countries/uk/geography";
import { JP_GEOGRAPHY } from "@/lib/countries/jp/geography";
import { IE_GEOGRAPHY } from "@/lib/countries/ie/geography";
import { selectPresetBundle } from "@/lib/seeds/presetSelector";
import { applyMetricPresetToMetrics, getRegionMetricPresets } from "@/lib/seeds/metricPresets";
import { applyEra1953Adjustments } from "@/lib/seeds/reference/stateMetricsEra1953";
import { stateMetrics1953 } from "@/lib/seeds/reference/stateMetrics1953";
import { stateMetrics1979 } from "@/lib/seeds/reference/stateMetrics1979";
import { stateMetrics1991, applyEra1991Adjustments } from "@/lib/seeds/reference/stateMetrics1991";
import { stateMetrics1999 } from "@/lib/seeds/reference/stateMetrics1999";
import { stateMetrics2007 } from "@/lib/seeds/reference/stateMetrics2007";
import { stateMetrics2023 } from "@/lib/seeds/reference/stateMetrics2023";
import { stateMetrics2027 } from "@/lib/seeds/reference/stateMetrics2027";
import type { OpeningCountry } from "@/lib/resetMetrics/rules/provisionalOpening";
import { COUNTRY_CONFIGS } from "@/lib/constants/countries";

export function modeledSeedMetrics(preset: string, country: OpeningCountry): StateMetrics[] {
  const geography = { US: US_GEOGRAPHY, UK: UK_GEOGRAPHY, JP: JP_GEOGRAPHY, IE: IE_GEOGRAPHY }[
    country
  ];
  const rows =
    country === COUNTRY_CONFIGS.US.id
      ? selectPresetBundle(
          preset,
          {
            "1953-default": stateMetrics1953,
            "1979-default": stateMetrics1979,
            "1991-default": stateMetrics1991,
            "1999-default": stateMetrics1999,
            "2007-default": stateMetrics2007,
            "2019-default": US_GEOGRAPHY.rawMetrics,
            "2023-default": stateMetrics2023,
            "2027-default": stateMetrics2027,
          },
          "modeled v2 US opening"
        )
      : geography.rawMetrics.map((r) =>
          preset === "1991-default"
            ? applyEra1991Adjustments(r)
            : preset === "1953-default" && country !== "IE"
              ? applyEra1953Adjustments(r)
              : r
        );
  return rows.map((row) => {
    const overlay = getRegionMetricPresets(country, String(row._id), preset);
    return overlay ? applyMetricPresetToMetrics(row, overlay) : row;
  });
}

export function modeledSeedRegions(preset: string, country: OpeningCountry) {
  const geography = { US: US_GEOGRAPHY, UK: UK_GEOGRAPHY, JP: JP_GEOGRAPHY, IE: IE_GEOGRAPHY }[
    country
  ];
  return selectPresetBundle(preset, geography.regionBundles, "modeled v2 region roster");
}

export function metricNumbers(row: object): Record<string, number> {
  const result: Record<string, number> = {};
  for (const [category, values] of Object.entries(row)) {
    if (!values || typeof values !== "object") continue;
    for (const [key, metric] of Object.entries(values)) {
      const value = (metric as { value?: unknown } | null)?.value;
      if (typeof value === "number" && Number.isFinite(value)) result[`${category}.${key}`] = value;
    }
  }
  return result;
}
