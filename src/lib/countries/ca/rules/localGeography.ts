import manifest from "@/data/subdivisions/ca/manifest.json";
export { isCanada, isCanadianCommons } from "../localGeographyFacts";

export const CA_GEOGRAPHY_REGIONS = Object.keys(manifest.coverage);
export const CA_RIDING_PLAN = "2023";

export function hasCanadianLocalGeography(regionId: string): boolean {
  return Object.hasOwn(manifest.coverage, regionId);
}
