import type { State } from "@/lib/db/types";
import { apportionSeats } from "@/lib/seeds/reference/rules/apportionSeats";
import { ruRegions2027 } from "@/lib/countries/ru/data/ruRegions2027";
import { plRegions2027 } from "@/lib/countries/pl/data/plRegions2027";
import { huRegions2027 } from "@/lib/countries/hu/data/huRegions2027";
import { roRegions2027 } from "@/lib/countries/ro/data/roRegions2027";
import { bgRegions1991 } from "@/lib/countries/bg/data/bgRegions1991";
import { countryHasFeature } from "@/lib/countries/rules/countryFeatures";

/**
 * January 2019 national population and current-price GDP in local currency,
 * from World Bank SP.POP.TOTL and NY.GDP.MKTP.CN.
 *
 * Bulgaria's GDP uses Eurostat's 2019 BGN 120,395 million national-account
 * total; the euro-scale 61,194 million figure would halve every lev amount.
 * The project has game macroregions with within-country shares based on the
 * nearest democratic region layout, rescaled to these totals. Shares are
 * model estimates, not observed regional GDP.
 */
export const MODERN_2019_NATIONALS = {
  RU: { population: 145_453_291, gdp: 109_608_300_000_000 },
  PL: { population: 37_965_475, gdp: 2_313_929_000_000 },
  HU: { population: 9_694_824, gdp: 47_940_496_000_000 },
  RO: { population: 19_371_648, gdp: 1_059_822_100_000 },
  BG: { population: 6_616_726, gdp: 120_395_000_000 },
} as const;

export type Modern2019CountryId = keyof typeof MODERN_2019_NATIONALS;

const BASE_REGIONS: Record<Modern2019CountryId, readonly State[]> = {
  RU: ruRegions2027,
  PL: plRegions2027,
  HU: huRegions2027,
  RO: roRegions2027,
  // The 2019 game defines five BG macroregions. The six-region 2027 NSI
  // layout cannot be retroactively applied without changing 2019 seat IDs.
  BG: bgRegions1991,
};

/** Deterministic largest-remainder distribution; preserves the exact total. */
function allocate(total: number, weights: number[]): number[] {
  const sum = weights.reduce((n, value) => n + value, 0);
  if (!(sum > 0)) throw new Error("2019 region weights must have a positive total");
  const exact = weights.map((weight) => (weight / sum) * total);
  const out = exact.map(Math.floor);
  const order = exact
    .map((value, index) => ({ index, fraction: value - out[index]! }))
    .sort((a, b) => b.fraction - a.fraction || a.index - b.index);
  const remainder = total - out.reduce((n, value) => n + value, 0);
  for (let i = 0; i < remainder; i++) {
    out[order[i]!.index] = out[order[i]!.index]! + 1;
  }
  return out;
}

export function modernRegions2019(countryId: Modern2019CountryId): State[] {
  const base = BASE_REGIONS[countryId];
  const national = MODERN_2019_NATIONALS[countryId];
  const population = allocate(
    national.population,
    base.map((region) => region.population ?? 0)
  );
  const gdpMillions = allocate(
    Math.round(national.gdp / 1_000_000),
    base.map((region) => region.gdp ?? 0)
  );
  const houseSeats = countryHasFeature("ruSeeds", countryId)
    ? 450
    : countryHasFeature("plSeeds", countryId)
      ? 460
      : countryHasFeature("huSeeds", countryId)
        ? 199
        : countryHasFeature("roSeeds", countryId)
          ? 329
          : 240;
  const senateSeats = countryHasFeature("plSeeds", countryId)
    ? 100
    : countryHasFeature("roSeeds", countryId)
      ? 136
      : 0;
  const weights = Object.fromEntries(
    base.map((region, index) => [String(region._id), population[index]!])
  );
  const house = apportionSeats(houseSeats, weights);
  const senate = senateSeats > 0 ? apportionSeats(senateSeats, weights) : {};
  return base.map((region, index) => ({
    ...region,
    population: population[index]!,
    gdp: gdpMillions[index]!,
    houseDistricts: house[String(region._id)]!,
    stateSenateSeats: senate[String(region._id)] ?? 0,
  }));
}
