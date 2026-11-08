import type { CountryEraOverride } from "../../contract";

/**
 * CN, 1979. DIFFERENCES ONLY; everything else comes from base modules.
 *
 * config is intentionally absent, not {}, because getCountryConfig
 * merges shallowly and {} reads as an empty override.
 *
 * No orders of battle: falls back to the base set.
 */
export const CN_1979: CountryEraOverride = {
  preset: "1979-default",
};
