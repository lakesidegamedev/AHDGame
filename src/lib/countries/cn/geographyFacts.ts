import type { AdjacencyMap } from "@/lib/constants/stateAdjacency";
import type { CountryMapConfig } from "@/lib/commodity-map/commodityMapRegistry";
import type { Continent } from "@/lib/constants/countryContinents";
import type { ConscriptionPolicy } from "@/lib/demographics/conscription";
import type { IncomeStartVintage, NormalAnchor } from "@/lib/era/metricCatalog";
import type { ScoreThreshold } from "@/lib/utils/metricScoring";
import type { WorldEntityRegion } from "@/lib/world/worldEntityManifest";

/*
 * GENERATED from `__snapshots__/cn.pre-move.json`. Do not edit values by hand; a hand draft got six values wrong and still typechecked. Regenerate with `npx tsx scripts/countries/gen-country-geography-facts.ts CN --force`.
 *
 * Must stay free of value imports: `geography.ts` imports all census, metric and region data as values, so importing it here ships that whole module to the browser.
 *
 * `COUNTRY_TO_ISO_NUMERIC` and `ISO_NUMERIC_TO_COUNTRY` describe one fact twice; the generator asserts they agree.
 */

export const CN_CONTINENT: Continent = "Asia";

/** ISO 3166-1 numeric. `ISO_NUMERIC_TO_COUNTRY` holds the inverse entry. */
export const CN_ISO_NUMERIC = "156";

export const CN_UN_MEMBER_SINCE = 1945;

export const CN_WORLD_REGION: WorldEntityRegion = "asia";

/** Where an NPP corporation is seated when it has no other home. */
export const CN_NPP_CAPITAL_STATE = "HB";

/* No CN_NON_PARTY_INDEPENDENT_BIAS: the registry has no CN entry, and
   `nonPartyIndependentBias` is optional in the contract. A country with no nudge
   is not a country nudged by zero. */

/** Map centring for the commodity and world maps: [longitude, latitude]. */
export const CN_MAP_ANCHOR: [number, number] = [104.2, 35.9];

/**
 * Median-income scoring thresholds.
 *
 * ⚠ LOCAL CURRENCY, like every money figure in the folder, and NOT comparable to
 * another country's.
 */
export const CN_MEDIAN_INCOME_THRESHOLDS: ScoreThreshold = {
  best: 125000,
  worst: 45000,
};

/** Conscription policy at seed time. */
export const CN_CONSCRIPTION: ConscriptionPolicy = {
  eligibleBand: [18, 22],
  sexEnabled: {
    male: true,
    female: false,
  },
  option: 6,
};

/**
 * Core-5 metric normals, keyed by metric.
 *
 * ⚠ THE REGISTRY IS METRIC-FIRST, NOT COUNTRY-FIRST. `CORE5_NORMALS` is read as
 * `CORE5_NORMALS.gdpGrowth.CN`, so the snapshot captured one entry per
 * metric rather than one object for the country. Each anchor is keyed `year`,
 * a NUMBER -- not `era`, a string.
 */
export const CN_CORE5_NORMALS: Record<string, NormalAnchor[]> = {
  gdpGrowth: [
    {
      year: 1953,
      value: 6,
    },
    {
      year: 1979,
      value: 6.5,
    },
    {
      year: 1991,
      value: 9,
    },
    {
      year: 2019,
      value: 6,
    },
    {
      year: 2040,
      value: 3.5,
    },
  ],
  unemploymentRate: [
    {
      year: 1953,
      value: 4.5,
    },
    {
      year: 1979,
      value: 5,
    },
    {
      year: 1991,
      value: 3,
    },
    {
      year: 2019,
      value: 4,
    },
    {
      year: 2040,
      value: 4.5,
    },
  ],
  lifeExpectancy: [
    {
      year: 1953,
      value: 42,
    },
    {
      year: 1979,
      value: 65,
    },
    {
      year: 1991,
      value: 69,
    },
    {
      year: 2019,
      value: 77,
    },
    {
      year: 2040,
      value: 81,
    },
  ],
  violentCrimeRate: [
    {
      year: 1953,
      value: 150,
    },
    {
      year: 1979,
      value: 100,
    },
    {
      year: 1991,
      value: 160,
    },
    {
      year: 2019,
      value: 90,
    },
    {
      year: 2040,
      value: 85,
    },
  ],
  povertyRate: [
    {
      year: 1953,
      value: 30,
    },
    {
      year: 1979,
      value: 28,
    },
    {
      year: 1991,
      value: 24,
    },
    {
      year: 2019,
      value: 8,
    },
    {
      year: 2040,
      value: 6,
    },
  ],
};

/**
 * Which regions border which.
 *
 * ⚠ KEYED BY REGION, AND FOR CN THOSE KEYS ARE NOT COUNTRY CODES. In the
 * United States' map `CA`, `DE` and `IN` are California, Delaware and Indiana,
 * not Canada, Germany and India. A tool that reads two-letter keys as countries
 * misreads this file, which is how 5,900 lines of US state data stayed invisible
 * to the relocation guard until its rule was fixed.
 */
export const CN_ADJACENCY_MAP: AdjacencyMap = {
  DB: ["HB"],
  HB: ["DB", "XB", "HZ", "HD"],
  HD: ["HB", "HZ", "HN"],
  HZ: ["HB", "HD", "XB", "XN", "HN"],
  HN: ["HZ", "HD", "XN"],
  XN: ["HZ", "HN", "XB"],
  XB: ["HB", "HZ", "XN"],
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
export const CN_MAP_REGISTRY: CountryMapConfig = {
  countryId: "CN",
  name: "China",
  overviewPath: "/country/cn",
  mapPath: "/country/cn/map",
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
export const CN_INCOME_ANCHORS: NormalAnchor[] = [
  {
    year: 1953,
    value: 80,
  },
  {
    year: 1979,
    value: 3500,
  },
  {
    year: 1991,
    // Interpolation point only. Worlds starting in 1991 score against CN_INCOME_START_VINTAGES instead; keeping this value preserves bands for 1999 and 2007 starts.
    value: 9000,
  },
  {
    year: 2019,
    value: 90000,
  },
];

/**
 * Income anchor for a world that STARTS in the given year, when that year's
 * seed is dated to a different currency vintage than the interpolation series
 * above. Used only at the exact start year; never interpolated.
 */
export const CN_INCOME_START_VINTAGES: Record<number, IncomeStartVintage> = {
  1991: { value: 3187, id: "cn-1991-household-r1" },
};

/*
 * ⚠ THESE TWO ARE INDEPENDENT, AND NESTING THEM COST ELEVEN COUNTRIES. The
 * income-anchor block was first written INSIDE the population-multiplier
 * ternary, so a country with anchors but no 1991 cohort row -- France, Austria,
 * East Germany and eight others -- emitted neither. Typecheck caught it only
 * because metricCatalog.ts had already been repointed at the missing export.
 */
export const CN_POPULATION_MULTIPLIERS: Record<string, number> = {
  party_cadre: 1.15,
  urban_professional: 0.5,
  rural_peasant: 1.6,
  industrial_worker: 1.2,
  migrant_worker: 0.4,
  entrepreneur: 0.2,
  youth: 1.1,
};
