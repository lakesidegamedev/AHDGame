import type { CountryEraOverride } from "../../contract";

/**
 * CN, 2019. DIFFERENCES ONLY; everything else comes from base modules.
 *
 * config is intentionally absent, not {}, because getCountryConfig
 * merges shallowly and {} reads as an empty override.
 *
 * No orders of battle: falls back to the base set.
 */
export const CN_2019: CountryEraOverride = {
  preset: "2019-default",
};
