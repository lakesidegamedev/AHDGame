import type { AdjacencyMap } from "@/lib/constants/stateAdjacency";
import type { CountryMapConfig } from "@/lib/commodity-map/commodityMapRegistry";
import type { Continent } from "@/lib/constants/countryContinents";

import type { WorldEntityRegion } from "@/lib/world/worldEntityManifest";

/**
 * GENERATED from __snapshots__/ukr.pre-move.json. Regenerate via
 * scripts/countries/gen-country-geography-facts.ts UKR --force.
 * Do NOT hand-edit values; hand-written drafts typechecked with wrong values.
 *
 * KEEP FREE OF VALUE IMPORTS: this is the light half of the pair;
 * `geography.ts` imports heavy census/metric/region data as values.
 *
 * ISO pair: `COUNTRY_TO_ISO_NUMERIC` and `ISO_NUMERIC_TO_COUNTRY` describe
 * one fact; the generator asserts they agree.
 */

export const UKR_CONTINENT: Continent = "Europe";

/** ISO 3166-1 numeric. `ISO_NUMERIC_TO_COUNTRY` holds the inverse entry. */
export const UKR_ISO_NUMERIC = "804";

export const UKR_UN_MEMBER_SINCE = 1945;

export const UKR_WORLD_REGION: WorldEntityRegion = "europe";

/** Where an NPP corporation is seated when it has no other home. */
export const UKR_NPP_CAPITAL_STATE = "UKR_KYI";

/* No UKR_NON_PARTY_INDEPENDENT_BIAS: the registry has no UKR entry, and
   `nonPartyIndependentBias` is optional in the contract. A country with no nudge
   is not a country nudged by zero. */

/** Map centring for the commodity and world maps: [longitude, latitude]. */
export const UKR_MAP_ANCHOR: [number, number] = [31, 49];

/**
 * Median-income scoring thresholds.
 *
 * ⚠ LOCAL CURRENCY, like every money figure in the folder, and NOT comparable to
 * another country's.
 */
/* No UKR_MEDIAN_INCOME_THRESHOLDS: no row in the registry. */

/**
 * Core-5 metric normals, keyed by metric.
 *
 * ⚠ THE REGISTRY IS METRIC-FIRST, NOT COUNTRY-FIRST. `CORE5_NORMALS` is read as
 * `CORE5_NORMALS.gdpGrowth.UKR`, so the snapshot captured one entry per
 * metric rather than one object for the country. Each anchor is keyed `year`,
 * a NUMBER -- not `era`, a string.
 */
/* No UKR_CORE5_NORMALS: the metric-first registry carries no UKR anchors. */

/**
 * Which regions border which.
 *
 * ⚠ KEYED BY REGION, AND FOR UKR THOSE KEYS ARE NOT COUNTRY CODES. In the
 * United States' map `CA`, `DE` and `IN` are California, Delaware and Indiana,
 * not Canada, Germany and India. A tool that reads two-letter keys as countries
 * misreads this file, which is how 5,900 lines of US state data stayed invisible
 * to the relocation guard until its rule was fixed.
 */
export const UKR_ADJACENCY_MAP: AdjacencyMap = {
  UKR_KYI: ["UKR_WES", "UKR_POD", "UKR_DNI"],
  UKR_WES: ["UKR_KYI", "UKR_POD"],
  UKR_POD: ["UKR_KYI", "UKR_WES", "UKR_DNI", "UKR_SOU"],
  UKR_DON: ["UKR_DNI"],
  UKR_DNI: ["UKR_KYI", "UKR_POD", "UKR_DON", "UKR_SOU"],
  UKR_SOU: ["UKR_POD", "UKR_DNI"],
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
export const UKR_MAP_REGISTRY: CountryMapConfig = {
  countryId: "UKR",
  name: "Ukraine",
  overviewPath: "/country/ua",
  mapPath: "/country/ua/map",
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
/* No UKR_INCOME_ANCHORS: the registry has no UKR row. */

/*
 * ⚠ THESE TWO ARE INDEPENDENT, AND NESTING THEM COST ELEVEN COUNTRIES. The
 * income-anchor block was first written INSIDE the population-multiplier
 * ternary, so a country with anchors but no 1991 cohort row -- France, Austria,
 * East Germany and eight others -- emitted neither. Typecheck caught it only
 * because metricCatalog.ts had already been repointed at the missing export.
 */
/* No UKR_POPULATION_MULTIPLIERS: the 1991 cohort table has no UKR row, so that era passes through at 1.0. */
