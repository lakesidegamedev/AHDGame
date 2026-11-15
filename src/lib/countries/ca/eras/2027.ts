import type { CountryEraOverride } from "../../contract";

/**
 * CA, 2027.
 *
 * No override: the field is ABSENT rather than `{}` because `getCountryConfig`
 * merges shallowly and `config: {}` reads as an override that supplies nothing.
 */
export const CA_2027: CountryEraOverride = {
  preset: "2027-default",
};
