/**
 * Whole-territory outlines for 1953 entities with no present-day equivalent,
 * built by `scripts/maps/build-historical-geo.mjs`.
 *
 * NOT a region shard, deliberately outside `REGION_SHARDS`: those union
 * regions whose OWNER is read from `states`, which holds only full countries.
 * These are protectorates, trust territories and international zones, so
 * ownership cannot resolve; they are static features claimed by
 * `mapFeatureIds`.
 *
 * Whole territories only, no internal regions: each is sphere-macro or
 * historical-presence, and nothing asks them for provinces.
 */
export const HISTORICAL_GEO_URL = "/historical-regions.json";

/**
 * The feature ids this file supplies. ENTITY KEYS, not ISO numerics: none of these
 * territories has an ISO numeric of its own, which is the whole reason the file
 * exists.
 */
export const HISTORICAL_FEATURE_IDS = [
  "SAAR",
  "FTT",
  "TNG",
  "ESH",
  "ZNZ",
  "TGB",
  "CMB",
  "ADN",
  "YD",
  "CZ",
  "TTPI",
] as const;

/**
 * ⚠️ DRAW ORDER — these must be added LAST, after the region-overlay blobs.
 *
 * An overlay territory is only visible if it is painted after whatever it overlays,
 * and its host may be drawn TWICE: once as a base country polygon, and again as a
 * unioned region blob if that host has a shard. Added before the blobs, the two
 * whose host has one — Saarland is one of Germany's Länder (`SL` in
 * `WEST_DE_REGION_CODES`), Trieste sits inside Italy's macro-regions — were painted
 * over and vanished, while the other nine looked fine, so a partial check passes.
 *
 * Each map expresses "last" differently, and both must be kept that way:
 *  - `WorldMapSVG` draws from one ordered feature array — append after the overlay
 *    block, not merely after the base countries.
 *  - `OrgWorldMap` has no such array; draw order is insertion order into its path
 *    Map, and the blobs are inserted last — so path these after that loop instead
 *    of pushing them onto the feature list.
 *
 * ⚠️ Where that ordering actually shows, on /world: every entity here is tiered
 * `historical-presence` (128 of them in 1953), which `buildTierLookup` resolves to
 * BACKGROUND — and background features are merged into one silhouette painted
 * before any individual path. So in the structural modes (`none` / `blocs`, the
 * default) these are not separately visible however they are ordered. The ordering
 * governs the heatmap modes, where `tierLookup` is undefined and every feature is
 * drawn individually, and it governs `OrgWorldMap`, which has no tier system at all
 * and is where org-membership shading needs them. Making them separately visible in
 * the structural modes is a TIER decision, not an ordering one, and would mean
 * promoting a class of 128 that the merged layer exists to keep off the globe.
 */
