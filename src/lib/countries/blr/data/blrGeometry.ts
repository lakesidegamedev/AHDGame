/**
 * The Byelorussian SSR's six oblasts, keyed by region code (= the game's
 * `states._id`). Ownership is read live from `states.countryId`. The shard
 * `public/blr-regions.json` is built by `scripts/maps/build-blr-geo.mjs`
 * (geoBoundaries BLR ADM1 dissolved through one topology, Minsk City folded
 * into Minsk oblast because the city is an enclave inside it and a separate
 * one-dot region would carry a third of the republic's politics), features
 * tagged `properties.regionCode` plus the legacy `id`/`na` other surfaces read.
 * Same code set in the 1953 and 1979 presets, one shard, no era variant.
 *
 * The codes carry the `BLR_` prefix because Byelorussia is in
 * `PREFIXED_REGION_ID_COUNTRIES`: region `_id`s share one global `states._id`
 * namespace and compactRegionCode / canonicalRegionId round-trip on the
 * `<CountryId>_` stem. Renaming these requires rebuilding the shard, which
 * writes the same codes.
 */
export const BLR_GEO_URL = "/blr-regions.json";

export const BLR_REGION_CODES = [
  "BLR_BRE",
  "BLR_GRO",
  "BLR_HOM",
  "BLR_MIN",
  "BLR_MOG",
  "BLR_VIT",
] as const;
