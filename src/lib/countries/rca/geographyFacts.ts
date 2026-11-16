import type { AdjacencyMap } from "@/lib/constants/stateAdjacency";
import type { CountryMapConfig } from "@/lib/commodity-map/commodityMapRegistry";
import type { Continent } from "@/lib/constants/countryContinents";
import type { WorldEntityRegion } from "@/lib/world/worldEntityManifest";

/**
 * The small facts about where California is.
 *
 * Keep this file free of value imports. `geography.ts` imports the region
 * data as values, so importing it here would ship it to the browser.
 */

export const RCA_CONTINENT: Continent = "North America";

/**
 * ISO 3166-1 numeric. California has none of its own, so it shares the US's, as
 * Scotland and Wales share the United Kingdom's. The inverse table keeps 840
 * for the United States.
 */
export const RCA_ISO_NUMERIC = "840";

export const RCA_WORLD_REGION: WorldEntityRegion = "americas";

/** Where an NPP corporation is seated when it has no other home. */
export const RCA_NPP_CAPITAL_STATE = "RCA_NOR";

/** Map centring for the commodity and world maps: [longitude, latitude]. */
export const RCA_MAP_ANCHOR: [number, number] = [-119.5, 37.2];

/* No RCA_CORE5_NORMALS: the metric-first registry carries no California anchors. */

/** Which regions border which, by land. */
export const RCA_ADJACENCY_MAP: AdjacencyMap = {
  RCA_LAX: ["RCA_SAN", "RCA_INL", "RCA_CVY"],
  RCA_BAY: ["RCA_CVY", "RCA_NOR"],
  RCA_SAN: ["RCA_LAX", "RCA_INL"],
  RCA_INL: ["RCA_LAX", "RCA_SAN", "RCA_CVY"],
  RCA_CVY: ["RCA_BAY", "RCA_NOR", "RCA_INL", "RCA_LAX"],
  RCA_NOR: ["RCA_BAY", "RCA_CVY"],
};

/** Map registry. California has no region map until its geometry is authored. */
export const RCA_MAP_REGISTRY: CountryMapConfig = {
  countryId: "RCA",
  name: "California Republic",
  overviewPath: "/country/rca",
  mapPath: "/country/rca/map",
  hasRegionMap: false,
};
