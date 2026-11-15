import type { CountryEraOverride } from "../../contract";

/**
 * CA, 1991.
 *
 * No override: the field is ABSENT rather than `{}` because `getCountryConfig`
 * merges shallowly and `config: {}` reads as an override that supplies nothing.
 */
export const CA_1991: CountryEraOverride = {
  preset: "1991-default",
};
