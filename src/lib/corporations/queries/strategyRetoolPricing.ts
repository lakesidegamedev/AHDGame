import { retoolQuote } from "@/lib/corporations/rules/retoolQuote";
import { freeTransitionConversion } from "@/lib/market/producerMarket/transitionRules";
import { shortageRetoolDecision } from "@/lib/corporations/shortageRetool";
import type { CommodityType } from "@/lib/constants/commodities";
import { SECTOR_FX_SPREAD } from "@/lib/constants/currencies";
/**
 * Per-strategy retool fee for the strategy picker. Converting off a retired
 * (sunset) method onto one of its named successors is discounted with the same
 * multiplier the retool command charges. A method's downside charge is added
 * on top, undiscounted, as the command does.
 */
import type { CurrencyCode } from "@/lib/constants/currencies";
import type { SectorStrategy } from "@/lib/constants/sectorStrategies";
import { STRATEGY_RETOOL_COST_FRACTION } from "@/lib/constants/sectorStrategies";
import { sunsetRetoolCostMultiplier } from "@/lib/constants/techTree";
import type { CorporateSector } from "@/lib/db/types";
import { readCorpEconomicAnchor } from "@/lib/currency/corpEconomyFields";
import { methodAdoptionSurchargeFraction } from "@/lib/corporations/rules/methodAdoption";

export interface StrategyRetoolPricingInput {
  sector: Pick<
    CorporateSector,
    "strategyId" | "revenue" | "cutoverTransition" | "cutoverStruggling" | "cutoverConvertedAtTurn"
  >;
  sectorHostLiquidCode: CurrencyCode | undefined;
  sectorHostFxRate: number;
  techTreesEnabled: boolean;
  techCurrentYear: number;
  currentTurn?: number;
  firstFundedTurn?: number;
  corporationLiquidCode?: CurrencyCode;
  commodityPrices?: { commodity: CommodityType; globalSupply?: number; globalDemand?: number }[];
}

export function strategyRetoolPricing(
  input: StrategyRetoolPricingInput,
  strategies: readonly SectorStrategy[],
  toStrategyId: string
) {
  const current = strategies.find((s) => s.id === (input.sector.strategyId ?? "standard"));
  const retoolCostMultiplier = input.techTreesEnabled
    ? sunsetRetoolCostMultiplier(current, toStrategyId, input.techCurrentYear)
    : 1;
  const revenueAnchor = readCorpEconomicAnchor(
    input.sector.revenue,
    input.sectorHostLiquidCode,
    input.sectorHostFxRate
  );
  const target = strategies.find((s) => s.id === toStrategyId);
  const balances = new Map(
    (input.commodityPrices ?? []).map((row) => [
      row.commodity,
      { supply: row.globalSupply ?? 0, demand: row.globalDemand ?? 0 },
    ])
  );
  const shortageDiscount = target ? shortageRetoolDecision(target, balances).qualifies : false;
  const freeConversion =
    input.currentTurn !== undefined &&
    freeTransitionConversion(input.sector, input.currentTurn + 1, input.firstFundedTurn);
  const foreign =
    !!input.corporationLiquidCode &&
    !!input.sectorHostLiquidCode &&
    input.corporationLiquidCode !== input.sectorHostLiquidCode;
  return retoolQuote({
    revenueAnchor,
    baseFraction: STRATEGY_RETOOL_COST_FRACTION,
    multiplier: retoolCostMultiplier,
    downsideFraction: methodAdoptionSurchargeFraction({ id: toStrategyId }),
    shortageDiscount,
    freeConversion,
    foreignSpreadRate: foreign ? SECTOR_FX_SPREAD : 0,
  });
}
