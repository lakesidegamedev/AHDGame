import type { CountryEraOverride } from "../../contract";

/**
 * NG, 2007. Generated; see scripts/countries/gen-country-eras.ts.
 *
 * Differences only: omitted fields come from base modules.
 * `config` is absent, not `{}`, since shallow merge treats `{}` as an override.
 */
export const NG_2007: CountryEraOverride = {
  preset: "2007-default",
};
