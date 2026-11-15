import { hasCanadianLocalGeography, isCanada } from "@/lib/countries/ca/rules/localGeography";

/** Path-safe legacy codes and Canadian province/territory codes only. */
export const SUBDIVISION_REGION_PATTERN = /^(?:[A-Z]{2,3}|CA_[A-Z]{2})$/;

export function subdivisionRegionMatchesCountry(country: string, region: string): boolean {
  return (
    SUBDIVISION_REGION_PATTERN.test(region) &&
    (isCanada(country) ? hasCanadianLocalGeography(region) : !region.startsWith("CA_"))
  );
}
