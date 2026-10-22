import {
  calcLogisticsGrowth,
  calcMarketingGrowth,
  calcRdGrowth,
  LOGISTICS_DECAY_RATE,
  RD_DECAY_RATE,
} from "@/lib/constants/corporations";
import type { CurrencyCode } from "@/lib/constants/currencies";
import { readCorpEconomicAnchor } from "@/lib/currency/corpEconomyFields";
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
}

export interface StrengthProjection {
  marketingStrengthGrowth: number;
  logisticsStrengthNetChange: number;
  rdScoreNetChange: number;
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
  const marketingDecay = strengthUpkeepActive(
    corporation.strengthUpkeepStage,
    STRENGTH_UPKEEP_STAGE.MARKETING_DECAY
  )
    ? currentMarketingStrength * MARKETING_DECAY_RATE
    : 0;

  const currentLogisticsStrength = corporation.logisticsStrength ?? 0;
  const logisticsGrowth = calcLogisticsGrowth(logisticsBudgetAnchor);
  const logisticsDecay = currentLogisticsStrength * LOGISTICS_DECAY_RATE;

  const currentRdScore = corporation.rdScore ?? 0;
  const rdGrowth = calcRdGrowth(rdBudgetAnchor, currentRdScore);
  const rdDecay = currentRdScore * RD_DECAY_RATE;

  return {
    marketingStrengthGrowth: marketingGrowth - marketingDecay,
    logisticsStrengthNetChange: logisticsGrowth - logisticsDecay,
    rdScoreNetChange: rdGrowth - rdDecay,
  };
}
