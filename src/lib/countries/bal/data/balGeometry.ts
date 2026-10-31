/**
 * The three Baltic union republics (Estonia, Latvia, Lithuania), keyed by
 * region code (= the game's `states._id`). Ownership is read live from
 * `states.countryId`. The shard `public/bal-regions.json` carries one feature
 * per republic, tagged `properties.regionCode` plus the legacy `id`/`na` other
 * surfaces read. Same code set in the 1953 and 1979 presets — one shard, no era
 * variant, because the republican borders did not move between the two.
 *
 * These ids replaced the old single `BAL_BAL` blob region; nothing should refer
 * to `BAL_BAL` any more.
 */
export const BAL_GEO_URL = "/bal-regions.json";

export const BAL_REGION_CODES = ["BAL_EST", "BAL_LVA", "BAL_LTU"] as const;
