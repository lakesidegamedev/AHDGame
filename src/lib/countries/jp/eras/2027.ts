import type { CountryEraOverride } from "../../contract";
import { JP_2023 } from "./2023";

/**
 * Japan, 2027. DIFFERENCES ONLY; everything else comes from base modules.
 *
 * Reuses 2023's order of battle deliberately: no new 2027 force structure
 * exists, and restating a known one beats inventing one. Spreading
 * `JP_2023.institutions` rather than copying keeps that reuse honest; a copy
 * would be a second source that drifts silently, so `japanReachable.test.ts`
 * compares with `toBe`.
 *
 * No config override: 2027 uses Japan's base configuration, same as 2023.
 */
export const JP_2027: CountryEraOverride = {
  preset: "2027-default",
  institutions: JP_2023.institutions,
};
