import type { CountryEraOverride } from "../../contract";

/**
 * NG, 1979. Generated; see scripts/countries/gen-country-eras.ts.
 *
 * Differences only: omitted fields come from base modules.
 * `config` is absent, not `{}`, since shallow merge treats `{}` as an override.
 */
export const NG_1979: CountryEraOverride = {
  preset: "1979-default",
};
