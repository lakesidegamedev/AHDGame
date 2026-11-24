import { TURNS_PER_DAY } from "@/lib/constants/corporations";
import {
  forecastSectorInvestment,
  type InvestmentForecastInput,
} from "@/lib/corporations/investment/rules";
import type { PlantsData } from "../types";

/** Project the same observed figures for the displayed scenario and sizing controls. */
export function investmentForecastInput(
  plants: PlantsData,
  units: number
): InvestmentForecastInput | null {
  const pnl = plants.pnl;
  const assumptions = plants.investment;
  return assumptions
    ? {
        units,
        constructionPerUnitAnchor: plants.buildQuote.perUnitAnchor,
        chargedPerUnitAnchor: plants.buildQuote.perUnitChargedAnchor,
        buildTurns: plants.buildTurns,
        depreciationPerTurn: plants.depreciationPerTurn,
        turnsPerDay: TURNS_PER_DAY,
        capacityUnits: plants.capacityUnits ?? 0,
        activeFraction: plants.mothballed ? 0 : (plants.activeCapacityPercent ?? 100) / 100,
        producedUnits: plants.producedUnits ?? 0,
        soldUnits: plants.soldUnits ?? 0,
        demandGapUnits: plants.demandGapUnits ?? 0,
        revenueDailyAnchor: Math.max(
          0,
          pnl.revenueAnchor - (assumptions.inventoryRevenueDailyAnchor ?? 0)
        ),
        operatingCostDailyAnchor:
          pnl.inputsAnchor +
          pnl.labourAnchor +
          pnl.complianceAnchor +
          pnl.otherOperatingAnchor +
          pnl.growthAndBuildAnchor +
          (assumptions.freightNetCostDailyAnchor ?? 0),
        inputsCostDailyAnchor: pnl.inputsAnchor,
        policyCreditDailyAnchor: pnl.policyAnchor ?? 0,
        overheadDailyAnchor: assumptions.overheadDailyAnchor,
        upkeepDailyAnchor: pnl.upkeepAnchor,
        taxRatePercent: assumptions.taxRatePercent,
      }
    : null;
}

export type ForecastBlocker =
  "noCapacity" | "mothballed" | "notRun" | "ramping" | "transition" | "upkeepBasis" | "other";

/**
 * Why the dialog has no profit or payback figure. The projection needs an
 * operating turn of this sector to scale from; this names which part is missing.
 */
export function forecastBlocker(plants: PlantsData): ForecastBlocker {
  if (plants.mothballed || (plants.activeCapacityPercent ?? 100) <= 0) return "mothballed";
  if (!((plants.capacityUnits ?? 0) > 0)) return "noCapacity";
  if (!((plants.producedUnits ?? 0) > 0)) return "notRun";
  // Results from a sector still inside its market support ramp are withheld, not missing.
  if (!plants.investment && (plants.governor?.active || plants.investmentWithheld === "ramp"))
    return "ramping";
  if (plants.investmentWithheld === "transition") return "transition";
  if (plants.investmentWithheld === "upkeepBasis") return "upkeepBasis";
  return "other";
}

export interface BuildReturnSummary {
  /** Net cash per turn once the whole order is delivered, after costs, overhead, tax and replacement. */
  profitPerTurn: number;
  /** Turns from the order until the charged build cash is recovered, or null beyond the forecast. */
  paybackTurn: number | null;
  /** No unmet demand is measured for this output, so added capacity is modelled with no extra sales. */
  noExtraBuyers: boolean;
}

/** Headline return figures for the build dialog, read off the same scenario as the forecast table. */
export function buildReturnSummary(plants: PlantsData, units: number): BuildReturnSummary | null {
  const input = investmentForecastInput(plants, units);
  if (!input) return null;
  const settled = Math.min(190, Math.max(1, Math.ceil(plants.buildTurns)) + 1);
  const rows = forecastSectorInvestment(input, [settled, settled + 1, 192]);
  const first = rows?.find((row) => row.turns === settled);
  const next = rows?.find((row) => row.turns === settled + 1);
  const last = rows?.find((row) => row.turns === 192);
  if (!rows || !first || !next || !last) return null;
  return {
    profitPerTurn: next.availableCashAnchor - first.availableCashAnchor,
    paybackTurn: last.cashPaybackTurn,
    noExtraBuyers: !((plants.demandGapUnits ?? 0) > 0),
  };
}
