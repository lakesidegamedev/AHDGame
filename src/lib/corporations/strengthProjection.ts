import {
  calcLogisticsGrowth,
  calcMarketingGrowth,
  calcRdGrowth,
  LOGISTICS_DECAY_RATE,
  RD_DECAY_RATE,
  TURNS_PER_DAY,
} from "@/lib/constants/corporations";
import type { CurrencyCode } from "@/lib/constants/currencies";
import { readCorpEconomicAnchor } from "@/lib/currency/corpEconomyFields";
import { allocateProductDevelopmentBudget } from "@/lib/products/rules/productBudgets";
import {
  MARKETING_DECAY_RATE,
  STRENGTH_UPKEEP_STAGE,
  strengthUpkeepActive,
} from "./strengthUpkeep";

interface StrengthProjectionInput {
  marketingBudget?: number | null;
  marketingStrength?: number | null;
  logisticsBudget?: number | null;
  logisticsStrength?: number | null;
  rdBudget?: number | null;
  rdScore?: number | null;
  liquidCurrencyCode?: CurrencyCode | string | null;
  strengthUpkeepStage?: number | null;
  /** Active product projects the turn pays from the R&D budget before generic research. */
  rdDevelopmentProjects?: readonly RdDevelopmentProject[];
}

export interface RdDevelopmentProject {
  id: string;
  stage: string;
  /** Development cost paid so far, in anchor currency. */
  paidAnchor: number;
  /** Total development cost, in anchor currency. */
  thresholdAnchor: number;
}

/**
 * Daily R&D budget left for generic research after the turn pays active
 * product development first (same allocator the turn runs, per turn).
 */
export function genericResearchDailyAnchor(
  dailyBudgetAnchor: number,
  projects: readonly RdDevelopmentProject[] | undefined
): number {
  if (!projects || projects.length === 0) return dailyBudgetAnchor;
  const { genericResearchAnchor } = allocateProductDevelopmentBudget({
    budgetAnchor: dailyBudgetAnchor / TURNS_PER_DAY,
    projects,
  });
  return genericResearchAnchor * TURNS_PER_DAY;
}

/** Cost still owed on projects in development, in anchor currency. */
export function remainingDevelopmentAnchor(projects: readonly RdDevelopmentProject[]): number {
  return projects.reduce(
    (sum, p) =>
      p.stage === "development"
        ? sum + Math.max(0, (p.thresholdAnchor || 0) - (p.paidAnchor || 0))
        : sum,
    0
  );
}

export interface StrengthProjection {
  marketingStrengthGrowth: number;
  /** Share of marketing strength lost each turn: 0 until the decay stage is on. */
  marketingDecayRate: number;
  logisticsStrengthNetChange: number;
  rdScoreNetChange: number;
  /** Points earned this turn from generic research, before decay. */
  rdScoreGrowth: number;
  /** Points lost to decay this turn. */
  rdScoreDecay: number;
}

export function calculateCorpStrengthProjection(
  corporation: StrengthProjectionInput,
  fxRate: number
): StrengthProjection {
  const marketingBudgetAnchor = readCorpEconomicAnchor(
    corporation.marketingBudget ?? 0,
    corporation.liquidCurrencyCode,
    fxRate
  );
  const logisticsBudgetAnchor = readCorpEconomicAnchor(
    corporation.logisticsBudget ?? 0,
    corporation.liquidCurrencyCode,
    fxRate
  );
  const rdBudgetAnchor = readCorpEconomicAnchor(
    corporation.rdBudget ?? 0,
    corporation.liquidCurrencyCode,
    fxRate
  );

  const currentMarketingStrength = corporation.marketingStrength ?? 0;
  const marketingGrowth = calcMarketingGrowth(marketingBudgetAnchor, currentMarketingStrength);
  const marketingDecayRate = strengthUpkeepActive(
    corporation.strengthUpkeepStage,
    STRENGTH_UPKEEP_STAGE.MARKETING_DECAY
  )
    ? MARKETING_DECAY_RATE
    : 0;
  const marketingDecay = currentMarketingStrength * marketingDecayRate;

  const currentLogisticsStrength = corporation.logisticsStrength ?? 0;
  const logisticsGrowth = calcLogisticsGrowth(logisticsBudgetAnchor);
  const logisticsDecay = currentLogisticsStrength * LOGISTICS_DECAY_RATE;

  const currentRdScore = corporation.rdScore ?? 0;
  const rdGrowth = calcRdGrowth(
    genericResearchDailyAnchor(rdBudgetAnchor, corporation.rdDevelopmentProjects),
    currentRdScore
  );
  const rdDecay = currentRdScore * RD_DECAY_RATE;

  return {
    marketingStrengthGrowth: marketingGrowth - marketingDecay,
    marketingDecayRate,
    logisticsStrengthNetChange: logisticsGrowth - logisticsDecay,
    rdScoreNetChange: rdGrowth - rdDecay,
    rdScoreGrowth: rdGrowth,
    rdScoreDecay: rdDecay,
  };
}

/**
 * Marketing strength a daily budget holds steady at once decay is on: the
 * level where the turn's growth equals what decay removes. Growth falls as
 * strength rises, so the gap is monotonic and bisection converges. Null when
 * there is no decay, since strength then climbs without a resting level.
 */
export function marketingStrengthEquilibrium(
  dailyBudgetAnchor: number,
  decayRate: number
): number | null {
  if (!(decayRate > 0) || !(dailyBudgetAnchor > 0)) return null;
  let lo = 0;
  let hi = 1;
  while (calcMarketingGrowth(dailyBudgetAnchor, hi) > hi * decayRate && hi < 1e6) hi *= 2;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (calcMarketingGrowth(dailyBudgetAnchor, mid) > mid * decayRate) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}
