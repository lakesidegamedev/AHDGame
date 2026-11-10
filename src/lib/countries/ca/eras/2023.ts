import type { CountryEraOverride } from "../../contract";

/**
 * CA, 2023.
 *
 * No override: the field is ABSENT rather than `{}` because `getCountryConfig`
 * merges shallowly and `config: {}` reads as an override that supplies nothing.
 */
export const CA_2023: CountryEraOverride = {
  preset: "2023-default",
};
