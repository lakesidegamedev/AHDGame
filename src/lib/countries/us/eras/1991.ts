import type { CountryEraOverride } from "../../contract";

/**
 * US, 1991. Generated from the pre-move snapshot; regenerate with gen-country-eras.ts.
 *
 * DIFFERENCES ONLY: everything not named here comes from the base modules.
 *
 * config is absent rather than {}: getCountryConfig merges shallowly, so {} reads as an override supplying nothing.
 * No orders of battle: this era falls back to the base set.
 */
export const US_1991: CountryEraOverride = {
  preset: "1991-default",
};
