import type { AdjacencyMap } from "@/lib/constants/stateAdjacency";
import type { CountryMapConfig } from "@/lib/commodity-map/commodityMapRegistry";
import type { Continent } from "@/lib/constants/countryContinents";
import type { ConscriptionPolicy } from "@/lib/demographics/conscription";
import type { NormalAnchor } from "@/lib/era/metricCatalog";
import type { ScoreThreshold } from "@/lib/utils/metricScoring";
import type { WorldEntityRegion } from "@/lib/world/worldEntityManifest";

/**
 * The small facts about where Canada is.
 *
 * Keep this file free of value imports. `geography.ts` imports every era of
 * census, metric and region data as values, so importing it here would ship all
 * of it to the browser.
 */

export const CA_CONTINENT: Continent = "North America";

/** ISO 3166-1 numeric. `ISO_NUMERIC_TO_COUNTRY` holds the inverse entry. */
export const CA_ISO_NUMERIC = "124";

export const CA_UN_MEMBER_SINCE = 1945;

export const CA_WORLD_REGION: WorldEntityRegion = "americas";

/** Where an NPP corporation is seated when it has no other home. */
export const CA_NPP_CAPITAL_STATE = "CA_ON";

/** Map centring for the commodity and world maps: [longitude, latitude]. */
export const CA_MAP_ANCHOR: [number, number] = [-96, 56];

/**
 * Median-income scoring thresholds, in Canadian dollars. Not comparable to
 * another country's figures.
 */
export const CA_MEDIAN_INCOME_THRESHOLDS: ScoreThreshold = {
  best: 110000,
  worst: 40000,
};

/** Canada has no conscription. */
export const CA_CONSCRIPTION: ConscriptionPolicy = {
  eligibleBand: [18, 20],
  sexEnabled: {
    male: false,
    female: false,
  },
  option: 0,
};

/**
 * Core-5 metric normals, keyed by metric. The registry is metric-first, so each
 * entry is one metric's anchors for this country, keyed by year.
 *
 * Sources: Statistics Canada labour force and life tables, OECD Health at a
 * Glance, World Bank WDI; 2040 values are game targets, not forecasts.
 */
export const CA_CORE5_NORMALS: Record<string, NormalAnchor[]> = {
  gdpGrowth: [
    { year: 2019, value: 1.9 },
    { year: 2040, value: 1.7 },
  ],
  unemploymentRate: [
    { year: 2019, value: 5.7 },
    { year: 2040, value: 6 },
  ],
  lifeExpectancy: [
    { year: 2019, value: 82.3 },
    { year: 2040, value: 84 },
  ],
  violentCrimeRate: [
    { year: 2019, value: 1250 },
    { year: 2040, value: 1100 },
  ],
  povertyRate: [
    { year: 2019, value: 11 },
    { year: 2040, value: 9 },
  ],
};

/** Which regions border which, by land or a short crossing. */
export const CA_ADJACENCY_MAP: AdjacencyMap = {
  CA_ON: ["CA_QC", "CA_MB"],
  CA_QC: ["CA_ON", "CA_NB", "CA_NL"],
  CA_BC: ["CA_AB", "CA_YT", "CA_NT"],
  CA_AB: ["CA_BC", "CA_SK", "CA_NT"],
  CA_MB: ["CA_ON", "CA_SK", "CA_NU"],
  CA_SK: ["CA_AB", "CA_MB", "CA_NT"],
  CA_NS: ["CA_NB", "CA_PE"],
  CA_NB: ["CA_QC", "CA_NS", "CA_PE"],
  CA_NL: ["CA_QC"],
  CA_PE: ["CA_NS", "CA_NB"],
  CA_YT: ["CA_BC", "CA_NT"],
  CA_NT: ["CA_BC", "CA_AB", "CA_SK", "CA_YT", "CA_NU"],
  CA_NU: ["CA_MB", "CA_NT"],
};

/** Region display names keyed by region id. */
export const CA_REGION_NAMES: Record<string, string> = {
  CA_ON: "Ontario",
  CA_QC: "Quebec",
  CA_BC: "British Columbia",
  CA_AB: "Alberta",
  CA_MB: "Manitoba",
  CA_SK: "Saskatchewan",
  CA_NS: "Nova Scotia",
  CA_NB: "New Brunswick",
  CA_NL: "Newfoundland and Labrador",
  CA_PE: "Prince Edward Island",
  CA_YT: "Yukon",
  CA_NT: "Northwest Territories",
  CA_NU: "Nunavut",
};

/**
 * Map registry for the commodity maps, which have no Canadian region view yet.
 * The country map page draws provinces from `data/canadaGeometry.ts`.
 */
export const CA_MAP_REGISTRY: CountryMapConfig = {
  countryId: "CA",
  name: "Canada",
  overviewPath: "/country/ca",
  mapPath: "/country/ca/map",
  hasRegionMap: false,
};

/** Income anchors by year, in Canadian dollars (median household income). */
export const CA_INCOME_ANCHORS: NormalAnchor[] = [
  { year: 2019, value: 82000 },
  { year: 2040, value: 140000 },
];
