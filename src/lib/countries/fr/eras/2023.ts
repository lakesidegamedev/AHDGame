import type { CountryEraOverride } from "../../contract";

/**
 * FR, 2023. GENERATED, edit via gen-country-eras.ts FR --force.
 * DIFFERENCES ONLY; absent fields fall back to base modules.
 * config is intentionally ABSENT, not {}: getCountryConfig merges shallowly,
 * so {} would read as an override supplying nothing.
 */
export const FR_2023: CountryEraOverride = {
  preset: "2023-default",
};
