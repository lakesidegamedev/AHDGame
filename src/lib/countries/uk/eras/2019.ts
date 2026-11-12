import type { CountryEraOverride } from "../../contract";

/**
 * UK, 2019. Generated override; regenerate via the gen-country-eras script.
 *
 * DIFFERENCES ONLY; unspecified fields come from base modules.
 *
 * No config override: the field is ABSENT, not {}, because getCountryConfig
 * merges shallowly and config: {} reads as an override supplying nothing.
 * No per-era orders of battle: falls back to the base set.
 */
export const UK_2019: CountryEraOverride = {
  preset: "2019-default",
};
