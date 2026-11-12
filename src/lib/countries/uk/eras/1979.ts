import type { CountryEraOverride } from "../../contract";

/**
 * UK, 1979. Generated override; regenerate via the gen-country-eras script.
 *
 * DIFFERENCES ONLY; unspecified fields come from base modules.
 *
 * No config override: the field is ABSENT, not {}, because getCountryConfig
 * merges shallowly and config: {} reads as an override supplying nothing.
 * No per-era orders of battle: falls back to the base set.
 */
export const UK_1979: CountryEraOverride = {
  preset: "1979-default",
};
