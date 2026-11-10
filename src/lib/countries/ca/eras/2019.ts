import type { CountryEraOverride } from "../../contract";

/**
 * CA, 2019.
 *
 * No override: the field is ABSENT rather than `{}` because `getCountryConfig`
 * merges shallowly and `config: {}` reads as an override that supplies nothing.
 */
export const CA_2019: CountryEraOverride = {
  preset: "2019-default",
};
