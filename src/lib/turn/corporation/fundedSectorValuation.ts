/**
 * Shell for funded valuation (gameConfig.fundedValuationStage >= 1): feeds one
 * funded sector's settled result to the rules in fundedValuationRules.ts.
 */
import type { CorporateSector } from "@/lib/db/types";
import { NPV_ANNUAL_DISCOUNT_RATE } from "@/lib/constants/corporations";
import { TURNS_PER_YEAR } from "@/lib/constants/turnTime";
import { sectorNpvBoostMultiplier } from "@/lib/corporations/rules/marketBoost";
import {
  BOOK_DEPRECIATION_FACTOR,
  sectorCapacityBookAnchor,
} from "@/lib/corporations/sectorProfitBasis";
import {
  fundedRealOutputAnchor,
  fundedSectorValueAnchor,
} from "@/lib/market/producerMarket/fundedValuationRules";
import type { FundedReceipt } from "@/lib/market/producerMarket/fundedSectorRules";

/** Value (anchor) and real output (anchor at base prices) of one funded sector. */
export function fundedSectorValuation(args: {
  sector: CorporateSector;
  receipt: FundedReceipt;
  /** The funded sector result: settled revenue and every cost the sector carries, per turn. */
  result: { hourlyRevenue: number; costs: number; outputMixPriceAnchor?: number };
  currentTurn: number;
  currentYear: number | undefined;
  eraUnitScale: number;
}): { valueAnchor: number; realOutputAnchor: number } {
  const { sector, receipt, result } = args;
  return {
    valueAnchor: fundedSectorValueAnchor({
      profitPerTurn: result.hourlyRevenue - result.costs,
      bookFloorAnchor:
        sectorCapacityBookAnchor(sector, args.currentYear, args.eraUnitScale) *
        BOOK_DEPRECIATION_FACTOR,
      turnsPerYear: TURNS_PER_YEAR,
      annualDiscountRate: NPV_ANNUAL_DISCOUNT_RATE,
      npvBoostMultiplier: sectorNpvBoostMultiplier(args.currentTurn),
    }),
    realOutputAnchor: fundedRealOutputAnchor(receipt.soldUnits, result.outputMixPriceAnchor ?? 0),
  };
}
