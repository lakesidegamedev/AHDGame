import type { CountryEraOverride } from "../../contract";

/**
 * CA, 2007.
 *
 * No override: the field is ABSENT rather than `{}` because `getCountryConfig`
 * merges shallowly and `config: {}` reads as an override that supplies nothing.
 */
export const CA_2007: CountryEraOverride = {
  preset: "2007-default",
};
