import type { AdjacencyMap } from "@/lib/constants/stateAdjacency";
import type { CountryMapConfig } from "@/lib/commodity-map/commodityMapRegistry";
import type { Continent } from "@/lib/constants/countryContinents";

import type { WorldEntityRegion } from "@/lib/world/worldEntityManifest";

/**
 * GENERATED from __snapshots__/yu.pre-move.json. Regenerate via
 * scripts/countries/gen-country-geography-facts.ts YU --force.
 * Do NOT hand-edit values; hand-written drafts typechecked with wrong values.
 *
 * KEEP FREE OF VALUE IMPORTS: this is the light half of the pair;
 * `geography.ts` imports heavy census/metric/region data as values.
 *
 * ISO pair: `COUNTRY_TO_ISO_NUMERIC` and `ISO_NUMERIC_TO_COUNTRY` describe
 * one fact; the generator asserts they agree.
 */

export const YU_CONTINENT: Continent = "Europe";

/** ISO 3166-1 numeric. `ISO_NUMERIC_TO_COUNTRY` holds the inverse entry. */
export const YU_ISO_NUMERIC = "890";

export const YU_UN_MEMBER_SINCE = 1945;

export const YU_WORLD_REGION: WorldEntityRegion = "europe";

/** Where an NPP corporation is seated when it has no other home. */
export const YU_NPP_CAPITAL_STATE = "YU_SRB";

/* No YU_NON_PARTY_INDEPENDENT_BIAS: the registry has no YU entry, and
   `nonPartyIndependentBias` is optional in the contract. A country with no nudge
   is not a country nudged by zero. */

/** Map centring for the commodity and world maps: [longitude, latitude]. */
export const YU_MAP_ANCHOR: [number, number] = [20.5, 44];

/**
 * Median-income scoring thresholds.
 *
 * ⚠ LOCAL CURRENCY, like every money figure in the folder, and NOT comparable to
 * another country's.
 */
/* No YU_MEDIAN_INCOME_THRESHOLDS: no row in the registry. */

/**
 * Core-5 metric normals, keyed by metric.
 *
 * ⚠ THE REGISTRY IS METRIC-FIRST, NOT COUNTRY-FIRST. `CORE5_NORMALS` is read as
 * `CORE5_NORMALS.gdpGrowth.YU`, so the snapshot captured one entry per
 * metric rather than one object for the country. Each anchor is keyed `year`,
 * a NUMBER -- not `era`, a string.
 */
/* No YU_CORE5_NORMALS: the metric-first registry carries no YU anchors. */

/**
 * Which regions border which.
 *
 * ⚠ KEYED BY REGION, AND FOR YU THOSE KEYS ARE NOT COUNTRY CODES. In the
 * United States' map `CA`, `DE` and `IN` are California, Delaware and Indiana,
 * not Canada, Germany and India. A tool that reads two-letter keys as countries
 * misreads this file, which is how 5,900 lines of US state data stayed invisible
 * to the relocation guard until its rule was fixed.
 */
export const YU_ADJACENCY_MAP: AdjacencyMap = {
  YU_SLO: ["YU_CRO"],
  YU_CRO: ["YU_SLO", "YU_BIH", "YU_VOJ", "YU_MNE"],
  YU_BIH: ["YU_CRO", "YU_SRB", "YU_MNE"],
  YU_SRB: ["YU_BIH", "YU_VOJ", "YU_KOS", "YU_MNE", "YU_MKD"],
  YU_VOJ: ["YU_CRO", "YU_SRB"],
  YU_KOS: ["YU_SRB", "YU_MNE", "YU_MKD"],
  YU_MNE: ["YU_CRO", "YU_BIH", "YU_SRB", "YU_KOS"],
  YU_MKD: ["YU_SRB", "YU_KOS"],
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
export const YU_MAP_REGISTRY: CountryMapConfig = {
  countryId: "YU",
  name: "Yugoslavia",
  overviewPath: "/country/yu",
  mapPath: "/country/yu/map",
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
/* No YU_INCOME_ANCHORS: the registry has no YU row. */

/*
 * ⚠ THESE TWO ARE INDEPENDENT, AND NESTING THEM COST ELEVEN COUNTRIES. The
 * income-anchor block was first written INSIDE the population-multiplier
 * ternary, so a country with anchors but no 1991 cohort row -- France, Austria,
 * East Germany and eight others -- emitted neither. Typecheck caught it only
 * because metricCatalog.ts had already been repointed at the missing export.
 */
/* No YU_POPULATION_MULTIPLIERS: the 1991 cohort table has no YU row, so that era passes through at 1.0. */
