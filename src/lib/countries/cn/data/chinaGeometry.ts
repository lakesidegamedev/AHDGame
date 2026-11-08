/**
 * China macro-region geometry, keyed by region code (= the game's `states._id`).
 * Seven stable macro-regions; ownership is read live from `states.countryId`.
 *
 * Era-aware in GEOMETRY, not region set: the Hong Kong / Macau handover (1997)
 * changes the shape of Huanan (`HN`) but adds no region. Both era shards carry
 * the identical seven codes; the renderer selects the era-correct `sourceUrl`
 * by game time, not ownership. See {@link isPreHKHandover}.
 *
 * Shards are tagged `properties.regionCode` by
 * `scripts/maps/tag-region-shard.mjs`, keeping the legacy `id`/`na` that
 * `RegionMapPaths` reads on other surfaces.
 */
export const CHINA_GEO_URL = "/cn-regions.json";
export const CHINA_GEO_URL_PRE_HANDOVER = "/cn-regions-1991.json";

export const CN_REGION_CODES = ["DB", "HB", "HD", "HN", "HZ", "XB", "XN"] as const;

export function isChinaRegion(code: string): boolean {
  return (CN_REGION_CODES as readonly string[]).includes(code);
}
