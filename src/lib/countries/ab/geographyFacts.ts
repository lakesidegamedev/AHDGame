import type { AdjacencyMap } from "@/lib/constants/stateAdjacency";
import type { CountryMapConfig } from "@/lib/commodity-map/commodityMapRegistry";
import type { Continent } from "@/lib/constants/countryContinents";
import type { WorldEntityRegion } from "@/lib/world/worldEntityManifest";

/**
 * The small facts about where Alberta is.
 *
 * Keep this file free of value imports. `geography.ts` imports the region
 * data as values, so importing it here would ship it to the browser.
 */

export const AB_CONTINENT: Continent = "North America";

/**
 * ISO 3166-1 numeric. Alberta has none of its own, so it shares Canada's, as
 * Scotland and Wales share the United Kingdom's. The inverse table keeps 124
 * for Canada.
 */
export const AB_ISO_NUMERIC = "124";

export const AB_WORLD_REGION: WorldEntityRegion = "americas";

/** Where an NPP corporation is seated when it has no other home. */
export const AB_NPP_CAPITAL_STATE = "AB_EDM";

/** Map centring for the commodity and world maps: [longitude, latitude]. */
export const AB_MAP_ANCHOR: [number, number] = [-114, 54];

/* No AB_CORE5_NORMALS: the metric-first registry carries no Alberta anchors. */

/** Which regions border which, by land. */
export const AB_ADJACENCY_MAP: AdjacencyMap = {
  AB_CAL: ["AB_CEN", "AB_SOU", "AB_FOO"],
  AB_EDM: ["AB_CEN", "AB_NOR", "AB_FOO"],
  AB_CEN: ["AB_CAL", "AB_EDM", "AB_SOU", "AB_FOO", "AB_NOR"],
  AB_SOU: ["AB_CAL", "AB_CEN"],
  AB_FOO: ["AB_CAL", "AB_EDM", "AB_CEN"],
  AB_NOR: ["AB_EDM", "AB_CEN"],
};

/** Map registry. Alberta has no region map until its geometry is authored. */
export const AB_MAP_REGISTRY: CountryMapConfig = {
  countryId: "AB",
  name: "Alberta",
  overviewPath: "/country/ab",
  mapPath: "/country/ab/map",
  hasRegionMap: false,
};
