import { buildTierLookup, isTierInteractive } from "@/components/landing/countryTiers";
import {
  battlegroundFeatureIdsForEra,
  economicPowerFeatureIdsForEra,
} from "@/components/landing/countryTierRosters";
import { LANDING_MARKERS } from "@/components/landing/landingMarkers";
import { ISO_TO_COUNTRY_ID } from "@/app/world/worldMetricHighlight";
import { WORLD_MAPPED_COUNTRIES } from "@/lib/worldCountryRegistry";
import { resolveCountryAvailability } from "@/lib/countryAvailability";
import type { CountryId } from "@/lib/constants/countriesCore";
import { CDN_WORLD_GEO_URL } from "@/lib/images/cdnUrls";
import type { EraConfig } from "@/components/landing/eraThemes";

const KIND_LETTER = { player: "p", economic: "e", battleground: "b" } as const;

/** Tiers, click targets and markers for the globe island, as plain JSON. */
export function buildGlobeConfig(
  era: EraConfig,
  macro: ReadonlySet<string>,
  playerCounts: Record<string, number>
) {
  const tiers = buildTierLookup(
    ISO_TO_COUNTRY_ID,
    era.accessMap,
    battlegroundFeatureIdsForEra(era.id),
    economicPowerFeatureIdsForEra(era.id)
  );
  const kinds: Record<string, string> = {};
  for (const id of macro) kinds[id] = "m";
  for (const [id, tier] of tiers) {
    if (tier !== "background") kinds[id] = KIND_LETTER[tier];
  }
  const nav: Record<string, string> = {};
  for (const [id, tier] of tiers) {
    if (!isTierInteractive(tier)) continue;
    const countryId = ISO_TO_COUNTRY_ID[id];
    const access = countryId ? era.accessMap[countryId] : undefined;
    const target =
      (access && resolveCountryAvailability(countryId as CountryId, access).preferredPath) ||
      WORLD_MAPPED_COUNTRIES[id]?.path;
    if (target) nav[id] = target;
  }
  const markers = Object.entries(LANDING_MARKERS)
    .filter(([id]) => era.accessMap[id]?.enabledForPlayers)
    .map(([id, marker]) => ({
      id,
      label: marker.label,
      lonLat: marker.lonLat,
      below: marker.below,
      count: playerCounts[id] ?? 0,
    }));
  return {
    geoUrl: CDN_WORLD_GEO_URL,
    rotation: era.initialRotation ?? [48, -30, 0],
    zoom: 1.05,
    kinds,
    nav,
    markers,
  };
}
