import type { CountryEraOverride } from "../../contract";

/**
 * NG, 1999. Generated; see scripts/countries/gen-country-eras.ts.
 *
 * Differences only: omitted fields come from base modules.
 * `config` is absent, not `{}`, since shallow merge treats `{}` as an override.
 */
export const NG_1999: CountryEraOverride = {
  preset: "1999-default",
};
