import { countryHasFeature } from "@/lib/countries/rules/countryFeatures";
/** Successor regions keep the calibration of the territory they inherited. */
export function inheritedCalibrationRegion(
  countryId: string,
  regionId: string
): { countryId: string; regionId: string } {
  if (countryHasFeature("scoSeeds", countryId) || countryHasFeature("walSeeds", countryId))
    return { countryId: "UK", regionId: countryId };
  if (countryHasFeature("ieSeeds", countryId) && regionId === "NIR")
    return { countryId: "UK", regionId: "NIR" };
  return { countryId, regionId };
}
export function inheritedCalibrationCountry(countryId: string): string {
  return countryHasFeature("scoSeeds", countryId) || countryHasFeature("walSeeds", countryId)
    ? "UK"
    : countryId;
}
