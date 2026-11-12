import type { CountryEraOverride } from "../../contract";

/**
 * PL, 1979. Generated; see scripts/countries/gen-country-eras.ts.
 *
 * Differences only: omitted fields come from base modules.
 * `config` is absent, not `{}`, since shallow merge treats `{}` as an override.
 */
export const PL_1979: CountryEraOverride = {
  preset: "1979-default",
};
