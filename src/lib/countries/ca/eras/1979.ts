import type { CountryEraOverride } from "../../contract";

/**
 * CA, 1979.
 *
 * No override: the field is ABSENT rather than `{}` because `getCountryConfig`
 * merges shallowly and `config: {}` reads as an override that supplies nothing.
 */
export const CA_1979: CountryEraOverride = {
  preset: "1979-default",
};
