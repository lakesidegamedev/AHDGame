/** Pure rules for cabinetEstates; the tables they read live in cabinetEstatesTables. */
import type { CountryId } from "@/lib/constants/countries";
import type { CabinetEstate, EstateFundingLevel } from "@/lib/db/types/cabinetEstate";
import {
  ABROAD_SITED_PORTFOLIOS,
  CONDITION_DRIFT_STEP,
  ESTATE_CATALOG,
  ESTATE_PORTFOLIO_BY_COUNTRY,
  FUNDING_LEVELS,
  TIER_MULTIPLIER,
  type EstateAggregate,
  type EstateArchetype,
  type FundingLevelDef,
} from "@/lib/constants/cabinetEstatesTables";

export function fundingDef(level: EstateFundingLevel): FundingLevelDef {
  return FUNDING_LEVELS.find((f) => f.id === level) ?? FUNDING_LEVELS[1];
}

/** Move condition one bounded step toward its funding-level baseline. */
export function driftCondition(current: number, fundingLevel: EstateFundingLevel): number {
  const target = fundingDef(fundingLevel).conditionBaseline;
  if (current < target) return Math.min(target, current + CONDITION_DRIFT_STEP);
  if (current > target) return Math.max(target, current - CONDITION_DRIFT_STEP);
  return current;
}

// ── Lookups ──────────────────────────────────────────────────────────────────
export function getPortfolioCatalog(portfolioKey: string): EstateArchetype[] {
  return ESTATE_CATALOG[portfolioKey] ?? [];
}

export function getEstateArchetype(
  portfolioKey: string,
  archetypeId: string
): EstateArchetype | undefined {
  return getPortfolioCatalog(portfolioKey).find((a) => a.id === archetypeId);
}

export function isAbroadSited(portfolioKey: string): boolean {
  return ABROAD_SITED_PORTFOLIOS.has(portfolioKey);
}

export function resolveEstatePortfolio(countryId: string, positionId: string): string | null {
  return ESTATE_PORTFOLIO_BY_COUNTRY[countryId as CountryId]?.[positionId] ?? null;
}

// ── Pure helpers ─────────────────────────────────────────────────────────────
export function computeEffectiveOutput(
  estate: Pick<CabinetEstate, "outputBase" | "tier" | "fundingLevel" | "condition">
): number {
  return Math.round(
    estate.outputBase *
      TIER_MULTIPLIER[estate.tier] *
      fundingDef(estate.fundingLevel).outputMult *
      (estate.condition / 100)
  );
}

export function computeEffectiveUpkeep(
  estate: Pick<CabinetEstate, "upkeepBase" | "tier" | "fundingLevel">
): number {
  return Math.round(
    estate.upkeepBase * TIER_MULTIPLIER[estate.tier] * fundingDef(estate.fundingLevel).upkeepMult
  );
}

export function aggregateEstates(estates: CabinetEstate[]): EstateAggregate {
  const bySite: Record<string, Record<string, number>> = {};
  let totalUpkeep = 0;
  for (const e of estates) {
    totalUpkeep += computeEffectiveUpkeep(e);
    const arch = getEstateArchetype(e.portfolioKey, e.archetypeId);
    if (!arch) continue;
    const outMult =
      TIER_MULTIPLIER[e.tier] * fundingDef(e.fundingLevel).outputMult * (e.condition / 100);
    const site = (bySite[e.siteId] ??= {});
    for (const [path, base] of Object.entries(arch.effects)) {
      site[path] = +((site[path] ?? 0) + base * outMult).toFixed(4);
    }
  }
  return { count: estates.length, totalUpkeep, bySite };
}
