import type { AdjacencyMap } from "@/lib/constants/stateAdjacency";
import type { CountryMapConfig } from "@/lib/commodity-map/commodityMapRegistry";
import type { Continent } from "@/lib/constants/countryContinents";

import type { WorldEntityRegion } from "@/lib/world/worldEntityManifest";

/**
 * Small geography facts for HU. Generated from
 * `__snapshots__/hu.pre-move.json`; regenerate with:
 *
 *     npx tsx scripts/countries/gen-country-geography-facts.ts HU --force
 *
 * Do not edit values by hand. Keep this file free of value imports: it is the
 * light half of the pair, and importing from `geography.ts` would pull every
 * era of census/metric/region data into the browser bundle.
 */

export const HU_CONTINENT: Continent = "Europe";

/** ISO 3166-1 numeric. `ISO_NUMERIC_TO_COUNTRY` holds the inverse entry. */
export const HU_ISO_NUMERIC = "348";

export const HU_UN_MEMBER_SINCE = 1955;

export const HU_WORLD_REGION: WorldEntityRegion = "europe";

/** Where an NPP corporation is seated when it has no other home. */
export const HU_NPP_CAPITAL_STATE = "HU_BUD";

/* No HU_NON_PARTY_INDEPENDENT_BIAS: the registry has no HU entry, and
   `nonPartyIndependentBias` is optional in the contract. A country with no nudge
   is not a country nudged by zero. */

/** Map centring for the commodity and world maps: [longitude, latitude]. */
export const HU_MAP_ANCHOR: [number, number] = [19.5, 47.2];

/**
 * Median-income scoring thresholds.
 *
 * ⚠ LOCAL CURRENCY, like every money figure in the folder, and NOT comparable to
 * another country's.
 */
/* No HU_MEDIAN_INCOME_THRESHOLDS: no row in the registry. */

/**
 * Core-5 metric normals, keyed by metric.
 *
 * ⚠ THE REGISTRY IS METRIC-FIRST, NOT COUNTRY-FIRST. `CORE5_NORMALS` is read as
 * `CORE5_NORMALS.gdpGrowth.HU`, so the snapshot captured one entry per
 * metric rather than one object for the country. Each anchor is keyed `year`,
 * a NUMBER -- not `era`, a string.
 */
/* No HU_CORE5_NORMALS: the metric-first registry carries no HU anchors. */

/**
 * Which regions border which.
 *
 * ⚠ KEYED BY REGION, AND FOR HU THOSE KEYS ARE NOT COUNTRY CODES. In the
 * United States' map `CA`, `DE` and `IN` are California, Delaware and Indiana,
 * not Canada, Germany and India. A tool that reads two-letter keys as countries
 * misreads this file, which is how 5,900 lines of US state data stayed invisible
 * to the relocation guard until its rule was fixed.
 */
export const HU_ADJACENCY_MAP: AdjacencyMap = {
  HU_BUD: ["HU_PES"],
  HU_PES: ["HU_BUD", "HU_TRW", "HU_NOR", "HU_ALF"],
  HU_TRW: ["HU_PES", "HU_TRS", "HU_ALF"],
  HU_TRS: ["HU_TRW", "HU_ALF"],
  HU_NOR: ["HU_PES", "HU_ALF"],
  HU_ALF: ["HU_PES", "HU_TRW", "HU_TRS", "HU_NOR"],
};

/**
 * Map registry: where the country's map lives and how its features map to
 * region ids.
 *
 * ⚠ THIS IS NOT A COUPLE OF FIELDS. A hand-written draft of the geography
 * module stubbed it as `{ countryId, anchor }` and would have broken the map
 * outright: the real record carries `name`, `overviewPath`, `mapPath`,
 * `hasRegionMap`, `geoUrl` and a `featureIdToStateId` table with one entry per
 * region. Guessing the shape of a config object is the same failure as guessing
 * a value, and it typechecks just as readily behind a cast.
 */
export const HU_MAP_REGISTRY: CountryMapConfig = {
  countryId: "HU",
  name: "Hungary",
  overviewPath: "/country/hu",
  mapPath: "/country/hu/map",
  hasRegionMap: false,
};

/**
 * 1991-era cohort multipliers.
 *
 * ⚠ 1991 ONLY. `POPULATION_MULTIPLIERS` lives in `stateDemographics1991.ts`
 * and describes how that era's cohorts differ from the modern ones. It says
 * nothing about any other preset, and a country missing from it passes through
 * unchanged at 1.0 rather than taking someone else's numbers.
 */
/* No HU_INCOME_ANCHORS: the registry has no HU row. */

/*
 * ⚠ THESE TWO ARE INDEPENDENT, AND NESTING THEM COST ELEVEN COUNTRIES. The
 * income-anchor block was first written INSIDE the population-multiplier
 * ternary, so a country with anchors but no 1991 cohort row -- France, Austria,
 * East Germany and eight others -- emitted neither. Typecheck caught it only
 * because metricCatalog.ts had already been repointed at the missing export.
 */
/* No HU_POPULATION_MULTIPLIERS: the 1991 cohort table has no HU row, so that era passes through at 1.0. */
