import type { AdjacencyMap } from "@/lib/constants/stateAdjacency";
import type { CountryMapConfig } from "@/lib/commodity-map/commodityMapRegistry";
import type { Continent } from "@/lib/constants/countryContinents";
import type { IncomeStartVintage, NormalAnchor } from "@/lib/era/metricCatalog";

import type { WorldEntityRegion } from "@/lib/world/worldEntityManifest";

/**
 * Small geography facts for ES. Generated from
 * `__snapshots__/es.pre-move.json`; regenerate with:
 *
 *     npx tsx scripts/countries/gen-country-geography-facts.ts ES --force
 *
 * Do not edit values by hand. Keep this file free of value imports: it is the
 * light half of the pair, and importing from `geography.ts` would pull every
 * era of census/metric/region data into the browser bundle.
 */

export const ES_CONTINENT: Continent = "Europe";

/** ISO 3166-1 numeric. `ISO_NUMERIC_TO_COUNTRY` holds the inverse entry. */
export const ES_ISO_NUMERIC = "724";

export const ES_UN_MEMBER_SINCE = 1955;

export const ES_WORLD_REGION: WorldEntityRegion = "europe";

/** Where an NPP corporation is seated when it has no other home. */
export const ES_NPP_CAPITAL_STATE = "ES_MAD";

/* No ES_NON_PARTY_INDEPENDENT_BIAS: the registry has no ES entry, and
   `nonPartyIndependentBias` is optional in the contract. A country with no nudge
   is not a country nudged by zero. */

/** Map centring for the commodity and world maps: [longitude, latitude]. */
export const ES_MAP_ANCHOR: [number, number] = [-3.7, 40.4];

/**
 * Median-income scoring thresholds.
 *
 * ⚠ LOCAL CURRENCY, like every money figure in the folder, and NOT comparable to
 * another country's.
 */
/* No ES_MEDIAN_INCOME_THRESHOLDS: no row in the registry. */

/**
 * Core-5 metric normals, keyed by metric.
 *
 * ⚠ THE REGISTRY IS METRIC-FIRST, NOT COUNTRY-FIRST. `CORE5_NORMALS` is read as
 * `CORE5_NORMALS.gdpGrowth.ES`, so the snapshot captured one entry per
 * metric rather than one object for the country. Each anchor is keyed `year`,
 * a NUMBER -- not `era`, a string.
 */
/* No ES_CORE5_NORMALS: the metric-first registry carries no ES anchors. */

/**
 * Which regions border which.
 *
 * ⚠ KEYED BY REGION, AND FOR ES THOSE KEYS ARE NOT COUNTRY CODES. In the
 * United States' map `CA`, `DE` and `IN` are California, Delaware and Indiana,
 * not Canada, Germany and India. A tool that reads two-letter keys as countries
 * misreads this file, which is how 5,900 lines of US state data stayed invisible
 * to the relocation guard until its rule was fixed.
 */
export const ES_ADJACENCY_MAP: AdjacencyMap = {
  ES_MAD: ["ES_CEN"],
  ES_CAT: ["ES_VAL", "ES_NOR"],
  ES_AND: ["ES_VAL", "ES_CEN"],
  ES_VAL: ["ES_CAT", "ES_AND", "ES_CEN", "ES_NOR"],
  ES_PVB: ["ES_CEN", "ES_NOR"],
  ES_GAL: ["ES_CEN", "ES_NOR"],
  ES_NOR: ["ES_CAT", "ES_VAL", "ES_PVB", "ES_GAL", "ES_CEN"],
  ES_CEN: ["ES_MAD", "ES_AND", "ES_VAL", "ES_PVB", "ES_GAL", "ES_NOR"],
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
export const ES_MAP_REGISTRY: CountryMapConfig = {
  countryId: "ES",
  name: "Spain",
  overviewPath: "/country/es",
  mapPath: "/country/es/map",
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
/**
 * Income anchors by year.
 *
 * ⚠ IN THE LIGHT MODULE ON PURPOSE. `metricCatalog.ts` reads these and is
 * CLIENT-REACHABLE. Pointing it at `geography.ts` instead shipped seventeen
 * countries' census, metric and region bundles into the browser -- the same
 * failure `countryContinents.ts` had when it started pulling 108 KB for one
 * string.
 */
export const ES_INCOME_ANCHORS: NormalAnchor[] = [
  {
    year: 1953,
    value: 14000,
  },
];

/**
 * Income anchor for a world that STARTS in the given year. Used only at the
 * exact start year; never interpolated. 1991 is the derived peseta household
 * median. 1979 is an authored gameplay level rather than a sourced statistic.
 */
export const ES_INCOME_START_VINTAGES: Record<number, IncomeStartVintage> = {
  1979: { value: 700_000, id: "es-1979-household-authored" },
  1991: { value: 2565869, id: "es-1991-household-r1" },
};

/*
 * ⚠ THESE TWO ARE INDEPENDENT, AND NESTING THEM COST ELEVEN COUNTRIES. The
 * income-anchor block was first written INSIDE the population-multiplier
 * ternary, so a country with anchors but no 1991 cohort row -- France, Austria,
 * East Germany and eight others -- emitted neither. Typecheck caught it only
 * because metricCatalog.ts had already been repointed at the missing export.
 */
/* No ES_POPULATION_MULTIPLIERS: the 1991 cohort table has no ES row, so that era passes through at 1.0. */
