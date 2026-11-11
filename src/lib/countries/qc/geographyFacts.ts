import type { AdjacencyMap } from "@/lib/constants/stateAdjacency";
import type { CountryMapConfig } from "@/lib/commodity-map/commodityMapRegistry";
import type { Continent } from "@/lib/constants/countryContinents";
import type { WorldEntityRegion } from "@/lib/world/worldEntityManifest";

/**
 * The small facts about where Quebec is.
 *
 * Keep this file free of value imports. `geography.ts` imports the region
 * data as values, so importing it here would ship it to the browser.
 */

export const QC_CONTINENT: Continent = "North America";

/**
 * ISO 3166-1 numeric. Quebec has none of its own, so it shares Canada's, as
 * Scotland and Wales share the United Kingdom's. The inverse table keeps 124
 * for Canada.
 */
export const QC_ISO_NUMERIC = "124";

export const QC_WORLD_REGION: WorldEntityRegion = "americas";

/** Where an NPP corporation is seated when it has no other home. */
export const QC_NPP_CAPITAL_STATE = "QC_CAP";

/** Map centring for the commodity and world maps: [longitude, latitude]. */
export const QC_MAP_ANCHOR: [number, number] = [-72, 52];

/* No QC_CORE5_NORMALS: the metric-first registry carries no Quebec anchors. */

/** Which regions border which, by land or a short crossing of the St Lawrence. */
export const QC_ADJACENCY_MAP: AdjacencyMap = {
  QC_MTL: ["QC_LLL", "QC_MON"],
  QC_LLL: ["QC_MTL", "QC_MON", "QC_OUT", "QC_MSL"],
  QC_MON: ["QC_MTL", "QC_LLL", "QC_EST"],
  QC_CAP: ["QC_EST", "QC_MSL", "QC_ENQ"],
  QC_EST: ["QC_MON", "QC_CAP", "QC_MSL"],
  QC_OUT: ["QC_LLL", "QC_MSL", "QC_ENQ"],
  QC_MSL: ["QC_LLL", "QC_CAP", "QC_EST", "QC_OUT", "QC_ENQ"],
  QC_ENQ: ["QC_CAP", "QC_OUT", "QC_MSL"],
};

/** Map registry. Quebec has no region map until its geometry is authored. */
export const QC_MAP_REGISTRY: CountryMapConfig = {
  countryId: "QC",
  name: "Quebec",
  overviewPath: "/country/qc",
  mapPath: "/country/qc/map",
  hasRegionMap: false,
};
