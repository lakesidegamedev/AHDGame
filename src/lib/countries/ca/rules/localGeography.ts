import manifest from "@/data/subdivisions/ca/manifest.json";

export const CA_GEOGRAPHY_REGIONS = Object.keys(manifest.coverage);
export const CA_RIDING_PLAN = "2023";

export function hasCanadianLocalGeography(regionId: string): boolean {
  return Object.hasOwn(manifest.coverage, regionId);
}

export function isCanadianCommons(type: string): boolean {
  return type === "caCommons" || type === "snap_caCommons";
}

export function isCanada(countryId: string): boolean {
  return countryId === manifest.countryId;
}
