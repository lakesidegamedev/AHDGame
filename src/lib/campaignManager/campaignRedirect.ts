import { EMBEDDED_PARAM } from "./links";
import { countryHasFeature } from "@/lib/countries/rules/countryFeatures";

/**
 * `/campaign/[id]` now lives on the race page. This decides whether the old
 * route redirects, and where. Plain data in and out; the page loads the
 * campaign, its race and the race phase.
 */

export interface CampaignRedirectRace {
  /** The race's ObjectId, as a string. */
  id: string;
  countryId: string | null | undefined;
  electionType: string | null | undefined;
  /** The race has not opened yet, so the race page shows no Blend view. */
  isUpcoming: boolean;
}

export type CampaignRedirectQuery = Record<string, string | string[] | undefined>;

/**
 * Null keeps the old page: Russia (its race does not use the Blend views), the
 * Political Operations iframe, and any race the race page would not render a
 * Blend view for. Otherwise the race page in Campaign mode, carrying `tab`,
 * `region` and every other query param.
 */
export function campaignRedirectTarget(
  campaignId: string,
  race: CampaignRedirectRace | null,
  query: CampaignRedirectQuery
): string | null {
  if (!race) return null;
  if (race.electionType !== "president") return null;
  if (countryHasFeature("ruLib", race.countryId)) return null;
  if (race.isUpcoming) return null;
  if (query[EMBEDDED_PARAM] !== undefined) return null;

  const params = new URLSearchParams({ view: "campaign", campaign: campaignId });
  for (const [key, value] of Object.entries(query)) {
    if (key === "view" || key === "campaign" || value === undefined) continue;
    for (const v of Array.isArray(value) ? value : [value]) params.append(key, v);
  }
  return `/elections/${race.id}?${params.toString()}`;
}
