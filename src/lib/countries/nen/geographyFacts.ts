import type { AdjacencyMap } from "@/lib/constants/stateAdjacency";
import type { CountryMapConfig } from "@/lib/commodity-map/commodityMapRegistry";
import type { Continent } from "@/lib/constants/countryContinents";
import type { WorldEntityRegion } from "@/lib/world/worldEntityManifest";

/**
 * The small facts about where New England is.
 *
 * Keep this file free of value imports. `geography.ts` imports the region
 * data as values, so importing it here would ship it to the browser.
 */

export const NEN_CONTINENT: Continent = "North America";

/**
 * ISO 3166-1 numeric. New England has none of its own, so it shares the US's, as
 * Scotland and Wales share the United Kingdom's. The inverse table keeps 840
 * for the United States.
 */
export const NEN_ISO_NUMERIC = "840";

export const NEN_WORLD_REGION: WorldEntityRegion = "americas";

/** Where an NPP corporation is seated when it has no other home. */
export const NEN_NPP_CAPITAL_STATE = "MA";

/** Map centring for the commodity and world maps: [longitude, latitude]. */
export const NEN_MAP_ANCHOR: [number, number] = [-71.6, 43.2];

/* No NEN_CORE5_NORMALS: the metric-first registry carries no New England anchors. */

/** Which regions border which, by land. */
export const NEN_ADJACENCY_MAP: AdjacencyMap = {
  ME: ["NH"],
  NH: ["ME", "VT", "MA"],
  VT: ["NH", "MA"],
  MA: ["NH", "VT", "RI", "CT"],
  RI: ["MA", "CT"],
  CT: ["MA", "RI"],
};

/** Map registry. New England has no region map until its geometry is authored. */
export const NEN_MAP_REGISTRY: CountryMapConfig = {
  countryId: "NEN",
  name: "New England",
  overviewPath: "/country/nen",
  mapPath: "/country/nen/map",
  hasRegionMap: false,
};
