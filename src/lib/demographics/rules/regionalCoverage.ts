/**
 * Regional electorate coverage around 2000. UK and Japan retain every present
 * eligible bucket instead of losing small groups at the cell-size floor. Japan's model
 * marks foreign-national resident categories with zero eligibility turnout.
 */
import type { GenericGranularDimInput } from "../granularCells";

const COVERAGE_POLICY: Record<string, { excludeNonNationals: boolean }> = {
  UK: { excludeNonNationals: false },
  JP: { excludeNonNationals: true },
};

export function retainRegionalRepresentation(countryId: string, year: number): boolean {
  return Boolean(COVERAGE_POLICY[countryId]) && year >= 1999 && year < 2007;
}

/** Eligibility uses the authored nationality rates, before GOTV or admin overlays. */
export function eligibleRegionalDimensions(
  countryId: string,
  dims: GenericGranularDimInput[],
  nationalityRates: Readonly<Record<string, number>> | undefined
): GenericGranularDimInput[] {
  if (!COVERAGE_POLICY[countryId]?.excludeNonNationals) return dims;
  return dims.map((dim) => {
    if (dim.name !== "ethnicity" || !nationalityRates) return dim;
    // These legacy bucket names denote nationality in Japan's Layer-1 model,
    // not ancestry. Naturalized citizens belong to its citizen category.
    const eligible = Object.entries(dim.marginals).filter(
      ([bucket]) => nationalityRates[bucket] !== 0
    );
    const total = eligible.reduce((sum, [, pct]) => sum + pct, 0);
    return {
      ...dim,
      marginals: Object.fromEntries(
        eligible.map(([bucket, pct]) => [bucket, total > 0 ? (pct * 100) / total : 0])
      ),
    };
  });
}
