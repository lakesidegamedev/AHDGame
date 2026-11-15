/**
 * How much seeded private capacity a country's NPP competitors get.
 *
 * Every market corporation spawns in the capital region and captures a fixed
 * 25% of that region's unowned pool, so seeded capacity tracks capital size,
 * not economy size (Tokyo ~38% of Japan's GDP, Berlin ~4% of Germany's,
 * Washington ~0.7% of the US). The cap sizes the whole country's competitor
 * book as one share of its own sector pool, so book size tracks GDP and
 * sector mix.
 */

/**
 * Share of a country's sector pool the NPP competitors may hold in total.
 * Anchored on the US, whose capital-region capture (25% of DC) is the smallest
 * relative to its economy (0.19%), so the US opening is unchanged and every
 * other country is brought down to the same proportion of its own economy.
 */
export const NPP_SEED_COUNTRY_POOL_SHARE = 0.0019;

/**
 * Per-corporation starting revenue ceiling (₳/day) for one (country, sector).
 * `countryPoolRevenue` is the sum of the sector's unowned seed revenue over all
 * of the country's regions. The ceiling never drops below `floorRevenue`, the
 * first-plant size, so a small economy still opens a working competitor.
 */
export function nppSeedRevenueCap(params: {
  countryPoolRevenue: number;
  perSectorCount: number;
  floorRevenue: number;
}): number {
  const { countryPoolRevenue, perSectorCount, floorRevenue } = params;
  const count = Math.max(1, perSectorCount);
  const share = (Math.max(0, countryPoolRevenue) * NPP_SEED_COUNTRY_POOL_SHARE) / count;
  return Math.max(Math.max(0, floorRevenue), share);
}
