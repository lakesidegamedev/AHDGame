import type { DemographicCategory, StateDemographics } from "@/lib/db/types";

/**
 * One counted slice of a region's electorate: census cells that share a
 * quantized lean and turnout, with live (drift and campaign adjusted) values.
 * The vote engines iterate these directly.
 */
export interface ElectorateUnit {
  id: string;
  /** Share of the electorate, percent (0..100). */
  populationPct: number;
  economicLean: number;
  socialLean: number;
  /** Turnout rate, percent (0..100). */
  turnout: number;
}

/**
 * Units from a stored group document, for callers that have no census row
 * (admin previews, fixtures). Category weights fold into the population share.
 */
export function electorateFromStoredGroups(
  demographics: StateDemographics,
  categories: readonly DemographicCategory[]
): ElectorateUnit[] {
  const units: ElectorateUnit[] = [];
  for (const category of categories) {
    const categoryWeight = demographics.categoryWeights[category._id] ?? 0;
    if (!Number.isFinite(categoryWeight) || categoryWeight <= 0) continue;
    for (const group of category.groups) {
      const stored = demographics.groups[group.id];
      units.push({
        id: group.id,
        populationPct: (stored?.population ?? 0) * (categoryWeight / 100),
        economicLean: stored?.economicLean ?? group.defaultEconomicLean,
        socialLean: stored?.socialLean ?? group.defaultSocialLean,
        turnout:
          (typeof stored?.turnout === "number" ? stored.turnout : group.defaultTurnout) ?? 55,
      });
    }
  }
  return units;
}
