import type { ElectorateUnit } from "@/lib/demographics/electorateUnit";

interface FixtureGroup {
  population?: number;
  economicLean?: number;
  socialLean?: number;
  turnout?: number;
}

interface FixtureCategory {
  _id: string;
  groups: {
    id: string;
    defaultEconomicLean: number;
    defaultSocialLean: number;
    defaultTurnout?: number;
  }[];
}

/**
 * Hand-built electorate units for tests that exercise a vote engine without a
 * census. Production code reads the census substrate only.
 */
export function electorateFromFixture(
  demographics: { categoryWeights: Record<string, number | undefined>; groups: object },
  categories: readonly FixtureCategory[]
): ElectorateUnit[] {
  const stored = demographics.groups as Record<string, FixtureGroup | undefined>;
  const units: ElectorateUnit[] = [];
  for (const category of categories) {
    const categoryWeight = demographics.categoryWeights[category._id] ?? 0;
    if (!Number.isFinite(categoryWeight) || categoryWeight <= 0) continue;
    for (const group of category.groups) {
      const row = stored[group.id];
      units.push({
        id: group.id,
        populationPct: (row?.population ?? 0) * (categoryWeight / 100),
        economicLean: row?.economicLean ?? group.defaultEconomicLean,
        socialLean: row?.socialLean ?? group.defaultSocialLean,
        turnout: (typeof row?.turnout === "number" ? row.turnout : group.defaultTurnout) ?? 55,
      });
    }
  }
  return units;
}
