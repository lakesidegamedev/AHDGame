import { type CountryId, type CountryStatus } from "@/lib/constants/countriesCore";
import { COUNTRY_CLIENT_CONFIGS } from "@/lib/constants/countryClientConfig";
import { resolveCountryAvailability } from "@/lib/countryAvailability";
import type { MetricCategoryId } from "@/lib/db/types";
import { WORLD_COUNTRY_ISO_TO_ID } from "@/lib/worldCountryRegistry";
import { getMetricCategory } from "@/lib/constants/metricDefinitions";

type CountryAccessMap = Partial<
  Record<
    CountryId,
    {
      enabledForPlayers: boolean;
      status: CountryStatus;
      economyPreview: boolean;
      registered?: boolean;
      econOnly?: boolean;
    }
  >
>;

export const ISO_TO_COUNTRY_ID = WORLD_COUNTRY_ISO_TO_ID;

export type MapTooltipAccessTone = "active" | "beta" | "planned";

function staticMappedStatusTone(status: "active" | "beta" | "planned"): {
  label: string;
  tone: MapTooltipAccessTone;
} {
  if (status === "active") return { label: "Active", tone: "active" };
  if (status === "beta") return { label: "Beta Access", tone: "beta" };
  return { label: "Planned", tone: "planned" };
}

/**
 * Status line for the world map tooltip: DB-driven for configured countries,
 * otherwise static fallback for non-configured roadmap countries.
 */
export function getMapTooltipAccessDisplay(
  isoId: string,
  mappedStatus: "active" | "beta" | "planned" | undefined,
  countryAccess: CountryAccessMap | undefined
): { label: string; tone: MapTooltipAccessTone; econOnly?: boolean } {
  const countryId = ISO_TO_COUNTRY_ID[isoId];
  const resolvedAccess = countryId ? countryAccess?.[countryId] : undefined;
  if (countryId && resolvedAccess) {
    const availability = resolveCountryAvailability(countryId, resolvedAccess);
    return {
      label: availability.label,
      tone: availability.tone,
      econOnly: availability.displayState === "econ-only" ? true : undefined,
    };
  }

  if (mappedStatus) return staticMappedStatusTone(mappedStatus);

  if (countryId) {
    const fallback = resolveCountryAvailability(countryId, {
      enabledForPlayers: COUNTRY_CLIENT_CONFIGS[countryId].status === "active",
      status: COUNTRY_CLIENT_CONFIGS[countryId].status,
      economyPreview: false,
    });
    return { label: fallback.label, tone: fallback.tone };
  }

  return { label: "Planned", tone: "planned" };
}

/** Category average label for map tooltip when a whole category is selected */
export function getCategoryAverageLabel(categoryId: MetricCategoryId): string {
  const cat = getMetricCategory(categoryId);
  return cat ? `${cat.name} (avg.)` : `${categoryId} (avg.)`;
}
