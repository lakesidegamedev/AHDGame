import type { AdjacencyMap } from "@/lib/constants/stateAdjacency";
import type { CountryMapConfig } from "@/lib/commodity-map/commodityMapRegistry";
import type { Continent } from "@/lib/constants/countryContinents";

import type { WorldEntityRegion } from "@/lib/world/worldEntityManifest";

/*
 * GENERATED from `__snapshots__/bg.pre-move.json`. Do not edit values by hand; a hand draft got six values wrong and still typechecked. Regenerate with `npx tsx scripts/countries/gen-country-geography-facts.ts BG --force`.
 *
 * Must stay free of value imports: `geography.ts` imports all census, metric and region data as values, so importing it here ships that whole module to the browser.
 *
 * `COUNTRY_TO_ISO_NUMERIC` and `ISO_NUMERIC_TO_COUNTRY` describe one fact twice; the generator asserts they agree.
 */

export const BG_CONTINENT: Continent = "Europe";

/** ISO 3166-1 numeric. `ISO_NUMERIC_TO_COUNTRY` holds the inverse entry. */
export const BG_ISO_NUMERIC = "100";

export const BG_UN_MEMBER_SINCE = 1955;

export const BG_WORLD_REGION: WorldEntityRegion = "europe";

/** Where an NPP corporation is seated when it has no other home. */
export const BG_NPP_CAPITAL_STATE = "BG_SOF";

/* No BG_NON_PARTY_INDEPENDENT_BIAS: the registry has no BG entry, and
   `nonPartyIndependentBias` is optional in the contract. A country with no nudge
   is not a country nudged by zero. */

/** Map centring for the commodity and world maps: [longitude, latitude]. */
export const BG_MAP_ANCHOR: [number, number] = [25.5, 42.7];

/**
 * Median-income scoring thresholds.
 *
 * ⚠ LOCAL CURRENCY, like every money figure in the folder, and NOT comparable to
 * another country's.
 */
/* No BG_MEDIAN_INCOME_THRESHOLDS: no row in the registry. */

/**
 * Core-5 metric normals, keyed by metric.
 *
 * ⚠ THE REGISTRY IS METRIC-FIRST, NOT COUNTRY-FIRST. `CORE5_NORMALS` is read as
 * `CORE5_NORMALS.gdpGrowth.BG`, so the snapshot captured one entry per
 * metric rather than one object for the country. Each anchor is keyed `year`,
 * a NUMBER -- not `era`, a string.
 */
/* No BG_CORE5_NORMALS: the metric-first registry carries no BG anchors. */

/**
 * Which regions border which.
 *
 * ⚠ KEYED BY REGION, AND FOR BG THOSE KEYS ARE NOT COUNTRY CODES. In the
 * United States' map `CA`, `DE` and `IN` are California, Delaware and Indiana,
 * not Canada, Germany and India. A tool that reads two-letter keys as countries
 * misreads this file, which is how 5,900 lines of US state data stayed invisible
 * to the relocation guard until its rule was fixed.
 */
export const BG_ADJACENCY_MAP: AdjacencyMap = {
  BG_SOF: ["BG_NOR", "BG_THR", "BG_SW"],
  BG_NOR: ["BG_SOF", "BG_COA", "BG_THR"],
  BG_COA: ["BG_NOR", "BG_THR"],
  BG_THR: ["BG_SOF", "BG_NOR", "BG_COA", "BG_SW"],
  BG_SW: ["BG_SOF", "BG_THR"],
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
export const BG_MAP_REGISTRY: CountryMapConfig = {
  countryId: "BG",
  name: "Bulgaria",
  overviewPath: "/country/bg",
  mapPath: "/country/bg/map",
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
/* No BG_INCOME_ANCHORS: the registry has no BG row. */

/*
 * ⚠ THESE TWO ARE INDEPENDENT, AND NESTING THEM COST ELEVEN COUNTRIES. The
 * income-anchor block was first written INSIDE the population-multiplier
 * ternary, so a country with anchors but no 1991 cohort row -- France, Austria,
 * East Germany and eight others -- emitted neither. Typecheck caught it only
 * because metricCatalog.ts had already been repointed at the missing export.
 */
/* No BG_POPULATION_MULTIPLIERS: the 1991 cohort table has no BG row, so that era passes through at 1.0. */
