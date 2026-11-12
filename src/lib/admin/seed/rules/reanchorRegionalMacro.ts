/**
 * Background countries carry regional metric rows authored for an earlier era.
 * Their income can sit in a pre-euro currency and their growth can disagree
 * with the national budget. These rules pull both back onto the national 2027
 * figures while keeping each region's relative position.
 */

/** Median household income as a share of GDP per head when no income series is authored. */
export const HOUSEHOLD_INCOME_SHARE_OF_GDP_PER_HEAD = 0.8;
/** Outside this band of GDP per head, a regional income set is treated as a unit error. */
export const PLAUSIBLE_INCOME_SHARE_BAND = { min: 0.3, max: 1.5 } as const;
/** National growth and the regional mean may differ by this many points before regions shift. */
export const GROWTH_TOLERANCE_POINTS = 1.5;

const RELATIVE_INCOME_BAND = { min: 0.6, max: 1.6 } as const;

export interface RegionMacroInput {
  id: string;
  population: number;
  medianIncome: number;
  gdpGrowth: number;
}

export interface RegionMacroPatch {
  id: string;
  medianIncome?: number;
  gdpGrowth?: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function weightedMean(regions: readonly RegionMacroInput[], pick: (r: RegionMacroInput) => number) {
  const population = regions.reduce((sum, region) => sum + region.population, 0);
  if (population <= 0) return 0;
  return regions.reduce((sum, region) => sum + pick(region) * region.population, 0) / population;
}

/** Share of GDP per head that the regions' population-weighted income represents. */
export function incomeShareOfGdpPerHead(
  nationalGdp: number,
  regions: readonly RegionMacroInput[]
): number {
  const population = regions.reduce((sum, region) => sum + region.population, 0);
  if (nationalGdp <= 0 || population <= 0) return 0;
  return weightedMean(regions, (region) => region.medianIncome) / (nationalGdp / population);
}

export function reanchorRegionalMacro(input: {
  nationalGdp: number;
  nationalGrowth: number | null;
  regions: readonly RegionMacroInput[];
}): RegionMacroPatch[] {
  const { nationalGdp, nationalGrowth, regions } = input;
  const population = regions.reduce((sum, region) => sum + region.population, 0);
  if (regions.length === 0 || population <= 0 || nationalGdp <= 0) return [];

  const patches = new Map<string, RegionMacroPatch>();
  const patch = (id: string) => {
    const existing = patches.get(id) ?? { id };
    patches.set(id, existing);
    return existing;
  };

  const share = incomeShareOfGdpPerHead(nationalGdp, regions);
  if (share < PLAUSIBLE_INCOME_SHARE_BAND.min || share > PLAUSIBLE_INCOME_SHARE_BAND.max) {
    const baseMean = weightedMean(regions, (region) => region.medianIncome);
    const target = (nationalGdp / population) * HOUSEHOLD_INCOME_SHARE_OF_GDP_PER_HEAD;
    const relative = regions.map((region) =>
      baseMean > 0
        ? clamp(region.medianIncome / baseMean, RELATIVE_INCOME_BAND.min, RELATIVE_INCOME_BAND.max)
        : 1
    );
    const relativeMean =
      regions.reduce((sum, region, index) => sum + relative[index]! * region.population, 0) /
      population;
    regions.forEach((region, index) => {
      patch(region.id).medianIncome = Math.round((target * relative[index]!) / relativeMean);
    });
  }

  if (nationalGrowth !== null && Number.isFinite(nationalGrowth)) {
    const meanGrowth = weightedMean(regions, (region) => region.gdpGrowth);
    if (Math.abs(meanGrowth - nationalGrowth) > GROWTH_TOLERANCE_POINTS) {
      for (const region of regions) {
        const deviation = clamp(
          region.gdpGrowth - meanGrowth,
          -GROWTH_TOLERANCE_POINTS,
          GROWTH_TOLERANCE_POINTS
        );
        patch(region.id).gdpGrowth = Math.round((nationalGrowth + deviation) * 100) / 100;
      }
    }
  }

  return [...patches.values()];
}
