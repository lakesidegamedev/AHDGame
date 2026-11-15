import type { AdjacencyMap } from "@/lib/constants/stateAdjacency";
import type { CountryMapConfig } from "@/lib/commodity-map/commodityMapRegistry";
import type { Continent } from "@/lib/constants/countryContinents";

import type { WorldEntityRegion } from "@/lib/world/worldEntityManifest";

/*
 * GENERATED from `__snapshots__/bal.pre-move.json`. Do not edit values by hand; a hand draft got six values wrong and still typechecked. Regenerate with `npx tsx scripts/countries/gen-country-geography-facts.ts BAL --force`.
 *
 * Must stay free of value imports: `geography.ts` imports all census, metric and region data as values, so importing it here ships that whole module to the browser.
 *
 * `COUNTRY_TO_ISO_NUMERIC` and `ISO_NUMERIC_TO_COUNTRY` describe one fact twice; the generator asserts they agree. BAL has no ISO numeric, so no code is emitted.
 */

export const BAL_CONTINENT: Continent = "Europe";

/* No BAL_ISO_NUMERIC: this entity has no ISO 3166-1 code, and the registry
   says so with an empty string rather than a number. Writing "" into the folder
   would put a value where there is none. */

export const BAL_WORLD_REGION: WorldEntityRegion = "europe";

/** Where an NPP corporation is seated when it has no other home. */
export const BAL_NPP_CAPITAL_STATE = "BAL_LVA";

/* No BAL_NON_PARTY_INDEPENDENT_BIAS: the registry has no BAL entry, and
   `nonPartyIndependentBias` is optional in the contract. A country with no nudge
   is not a country nudged by zero. */

/** Map centring for the commodity and world maps: [longitude, latitude]. */
export const BAL_MAP_ANCHOR: [number, number] = [24.5, 57];

/**
 * Median-income scoring thresholds.
 *
 * ⚠ LOCAL CURRENCY, like every money figure in the folder, and NOT comparable to
 * another country's.
 */
/* No BAL_MEDIAN_INCOME_THRESHOLDS: no row in the registry. */

/**
 * Core-5 metric normals, keyed by metric.
 *
 * ⚠ THE REGISTRY IS METRIC-FIRST, NOT COUNTRY-FIRST. `CORE5_NORMALS` is read as
 * `CORE5_NORMALS.gdpGrowth.BAL`, so the snapshot captured one entry per
 * metric rather than one object for the country. Each anchor is keyed `year`,
 * a NUMBER -- not `era`, a string.
 */
/* No BAL_CORE5_NORMALS: the metric-first registry carries no BAL anchors. */

/**
 * Which regions border which.
 *
 * ⚠ KEYED BY REGION, AND FOR BAL THOSE KEYS ARE NOT COUNTRY CODES. In the
 * United States' map `CA`, `DE` and `IN` are California, Delaware and Indiana,
 * not Canada, Germany and India. A tool that reads two-letter keys as countries
 * misreads this file, which is how 5,900 lines of US state data stayed invisible
 * to the relocation guard until its rule was fixed.
 */
export const BAL_ADJACENCY_MAP: AdjacencyMap = {
  BAL_LTU: ["BAL_LVA"],
  BAL_LVA: ["BAL_LTU", "BAL_EST"],
  BAL_EST: ["BAL_LVA"],
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
export const BAL_MAP_REGISTRY: CountryMapConfig = {
  countryId: "BAL",
  name: "Baltic Republics",
  overviewPath: "/country/bal",
  mapPath: "/country/bal/map",
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
/* No BAL_INCOME_ANCHORS: the registry has no BAL row. */

/*
 * ⚠ THESE TWO ARE INDEPENDENT, AND NESTING THEM COST ELEVEN COUNTRIES. The
 * income-anchor block was first written INSIDE the population-multiplier
 * ternary, so a country with anchors but no 1991 cohort row -- France, Austria,
 * East Germany and eight others -- emitted neither. Typecheck caught it only
 * because metricCatalog.ts had already been repointed at the missing export.
 */
/* No BAL_POPULATION_MULTIPLIERS: the 1991 cohort table has no BAL row, so that era passes through at 1.0. */
