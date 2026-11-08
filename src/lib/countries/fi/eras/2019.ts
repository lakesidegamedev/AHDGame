import type { CountryEraOverride } from "../../contract";

/**
 * FI, 2019. GENERATED, edit via gen-country-eras.ts FI --force.
 * DIFFERENCES ONLY; absent fields fall back to base modules.
 * config is intentionally ABSENT, not {}: getCountryConfig merges shallowly,
 * so {} would read as an override supplying nothing.
 */
export const FI_2019: CountryEraOverride = {
  preset: "2019-default",
};
