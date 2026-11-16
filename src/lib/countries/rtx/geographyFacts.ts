import type { AdjacencyMap } from "@/lib/constants/stateAdjacency";
import type { CountryMapConfig } from "@/lib/commodity-map/commodityMapRegistry";
import type { Continent } from "@/lib/constants/countryContinents";
import type { WorldEntityRegion } from "@/lib/world/worldEntityManifest";

/**
 * The small facts about where Texas is.
 *
 * Keep this file free of value imports. `geography.ts` imports the region
 * data as values, so importing it here would ship it to the browser.
 */

export const RTX_CONTINENT: Continent = "North America";

/**
 * ISO 3166-1 numeric. Texas has none of its own, so it shares the US's, as
 * Scotland and Wales share the United Kingdom's. The inverse table keeps 840
 * for the United States.
 */
export const RTX_ISO_NUMERIC = "840";

export const RTX_WORLD_REGION: WorldEntityRegion = "americas";

/** Where an NPP corporation is seated when it has no other home. */
export const RTX_NPP_CAPITAL_STATE = "RTX_CEN";

/** Map centring for the commodity and world maps: [longitude, latitude]. */
export const RTX_MAP_ANCHOR: [number, number] = [-99.5, 31.2];

/* No RTX_CORE5_NORMALS: the metric-first registry carries no Texas anchors. */

/** Which regions border which, by land. */
export const RTX_ADJACENCY_MAP: AdjacencyMap = {
  RTX_DFW: ["RTX_CEN", "RTX_EAS", "RTX_WES"],
  RTX_HOU: ["RTX_CEN", "RTX_EAS", "RTX_SOU"],
  RTX_CEN: ["RTX_DFW", "RTX_HOU", "RTX_SOU", "RTX_WES", "RTX_EAS"],
  RTX_SOU: ["RTX_HOU", "RTX_CEN", "RTX_WES"],
  RTX_WES: ["RTX_DFW", "RTX_CEN", "RTX_SOU"],
  RTX_EAS: ["RTX_DFW", "RTX_HOU", "RTX_CEN"],
};

/** Map registry. Texas has no region map until its geometry is authored. */
export const RTX_MAP_REGISTRY: CountryMapConfig = {
  countryId: "RTX",
  name: "Republic of Texas",
  overviewPath: "/country/rtx",
  mapPath: "/country/rtx/map",
  hasRegionMap: false,
};
