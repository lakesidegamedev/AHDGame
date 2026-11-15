import type { CountryEraOverride } from "../../contract";

/**
 * CA, 1953.
 *
 * No override: the field is ABSENT rather than `{}` because `getCountryConfig`
 * merges shallowly and `config: {}` reads as an override that supplies nothing.
 */
export const CA_1953: CountryEraOverride = {
  preset: "1953-default",
};
