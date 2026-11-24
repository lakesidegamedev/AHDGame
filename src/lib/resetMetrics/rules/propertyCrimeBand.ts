import { CA_PROPERTY_CRIME_NORMALS } from "@/lib/countries/ca/geographyFacts";
import { US_PROPERTY_CRIME_NORMALS } from "@/lib/countries/us/geographyFacts";
import type { NormalAnchor } from "@/lib/era/metricCatalogTypes";

const PROPERTY_CRIME_NORMALS: Readonly<Record<string, readonly NormalAnchor[]>> = {
  US: US_PROPERTY_CRIME_NORMALS,
  CA: CA_PROPERTY_CRIME_NORMALS,
};

/** Violent crime's era band spans about 0.2x to 1.85x its normal; property uses the same shape. */
const BEST_SHARE = 0.2;
const WORST_SHARE = 1.85;

function normalAt(anchors: readonly NormalAnchor[], year: number): number {
  if (year <= anchors[0]!.year) return anchors[0]!.value;
  for (let i = 1; i < anchors.length; i++) {
    const [from, to] = [anchors[i - 1]!, anchors[i]!];
    if (year <= to.year)
      return from.value + ((to.value - from.value) * (year - from.year)) / (to.year - from.year);
  }
  return anchors[anchors.length - 1]!.value;
}

/**
 * Era scale for the board's property crime measure. The legacy total-crime
 * scale (1,500 to 11,000) is so wide that modern rates score near the top and
 * small condition changes move the rate by thousands.
 */
export function propertyCrimeBand(
  countryId: string,
  year: number
): { best: number; worst: number } | null {
  const anchors = PROPERTY_CRIME_NORMALS[countryId];
  if (!anchors?.length || !Number.isFinite(year)) return null;
  const normal = normalAt(anchors, year);
  return { best: normal * BEST_SHARE, worst: normal * WORST_SHARE };
}
