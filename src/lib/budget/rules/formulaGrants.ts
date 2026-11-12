import type { FormulaGrant } from "@/lib/db/types/budget";

export interface GrantRegion {
  id: string;
  population: number;
  povertyRate: number;
}

/** Macro poverty values are percentages; zero is a valid observation. */
export function grantPovertyRate(value: number | undefined): number {
  return value !== undefined && Number.isFinite(value) && value >= 0 && value <= 100 ? value : 12;
}

export function formulaGrantPool(revenue: number, programs: readonly FormulaGrant[]): number {
  return programs.reduce((sum, p) => sum + (revenue * p.poolPercentage) / 100, 0);
}

/** Same grant formulas for bootstrap, annual rollover and headless hosts. */
export function allocateFormulaGrants(
  revenue: number,
  programs: readonly FormulaGrant[],
  regions: readonly GrantRegion[]
): Record<string, number> {
  if (!Number.isFinite(revenue) || revenue < 0) throw new Error("Invalid grant revenue");
  if (
    regions.some(
      (r) =>
        !Number.isFinite(r.population) ||
        r.population < 0 ||
        !Number.isFinite(r.povertyRate) ||
        r.povertyRate < 0 ||
        r.povertyRate > 100
    )
  )
    throw new Error("Invalid grant region");
  const totalPopulation = regions.reduce((sum, r) => sum + r.population, 0);
  const totalPoverty = regions.reduce((sum, r) => sum + r.population * r.povertyRate, 0);
  const result = Object.fromEntries(regions.map((r) => [r.id, 0]));
  for (const program of programs) {
    const pool = (revenue * program.poolPercentage) / 100;
    for (const region of regions) {
      const population = totalPopulation > 0 ? region.population / totalPopulation : 0;
      const poverty =
        totalPoverty > 0 ? (region.population * region.povertyRate) / totalPoverty : population;
      const weights = program.hybridWeights ?? { population: 0.5, poverty: 0.5 };
      const share =
        program.formulaType === "poverty"
          ? poverty
          : program.formulaType === "hybrid"
            ? weights.population * population + weights.poverty * poverty
            : population;
      result[region.id] += pool * share;
    }
  }
  return result;
}

/** Preserve a balanced modeled region's service mix when its opening grant is reconciled. */
export function openingRegionalGrantBudget(input: {
  revenue: number;
  oldGrant: number;
  newGrant: number;
  spending: Readonly<Record<string, number>>;
}) {
  const revenue = input.revenue - input.oldGrant + input.newGrant;
  const oldSpending = Object.values(input.spending).reduce((sum, n) => sum + n, 0);
  if (!Number.isFinite(revenue) || revenue < 0 || oldSpending <= 0)
    throw new Error("Invalid opening regional grant budget");
  const byCategory = Object.fromEntries(
    Object.entries(input.spending).map(([key, value]) => [key, (value * revenue) / oldSpending])
  );
  const spending = Object.values(byCategory).reduce((sum, n) => sum + n, 0);
  return { revenue, byCategory, spending, surplus: revenue - spending };
}
