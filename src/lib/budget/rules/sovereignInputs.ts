/**
 * The debt-dynamics inputs behind the rate card, the debt path chart and the
 * economy payload.
 *
 * All three price the same identity from the same budget fields. Deriving them
 * separately let the surfaces drift: one denominator here, the interest bill
 * added back there, and a trajectory the rollover never charged.
 *
 * Pure rules: plain data in, plain data out.
 */

import { federalSurplus, type SurplusInputs } from "@/lib/budget/federalSurplus";
import type { SovereignRiskAnchor } from "@/lib/db/types/budget";
import { resolveRatioGdp } from "./gdpDenominator";
import type { SovereignRateInputs } from "./sovereignRate";

/** The live budget fields the identity reads. */
export interface SovereignBudgetFields extends SurplusInputs {
  gdp?: number;
  gdpSmoothed?: number;
  debt?: { principal?: number; interestRate?: number } | null;
  /** Ratio the debt panel shows; falls back to the stock over GDP. */
  debtToGdpRatio?: number;
  economicFactors?: { gdpGrowth?: number; inflationRate?: number } | null;
  investorConfidence?: number | null;
  imfSovereignBailoutActive?: boolean | null;
  sovereignRiskAnchor?: SovereignRiskAnchor;
}

/** One prior fiscal close, as the trend series records it. */
export interface SovereignFiscalClose {
  revenue: number;
  spending: number;
  gdp: number;
  debtToGdp: number;
  debtPrincipal?: number;
  debtRate?: number;
  gdpGrowth?: number;
  inflationRate?: number;
  investorConfidence?: number | null;
  imfBailoutActive?: boolean | null;
}

const finite = (value: number | null | undefined): number =>
  typeof value === "number" && Number.isFinite(value) ? value : 0;

/**
 * Live inputs: the stored ratio the debt panel shows (the stock over smoothed
 * GDP when a document predates it), and the total balance with the interest
 * bill added back, because `spending.total` already contains debt service.
 */
export function sovereignInputsFromBudget(budget: SovereignBudgetFields): SovereignRateInputs {
  const gdp = resolveRatioGdp(budget);
  const principal = Math.max(0, finite(budget.debt?.principal));
  const primaryBalance = federalSurplus(budget) + principal * finite(budget.debt?.interestRate);
  const storedRatio = budget.debtToGdpRatio;
  const storedUsable =
    typeof storedRatio === "number" && Number.isFinite(storedRatio) && storedRatio >= 0;
  return {
    debtToGdpRatio: storedUsable ? storedRatio : gdp > 0 ? principal / gdp : 0,
    primaryBalanceToGdp: gdp > 0 ? primaryBalance / gdp : 0,
    realGrowthPct: budget.economicFactors?.gdpGrowth,
    inflationPct: budget.economicFactors?.inflationRate,
    investorConfidence: budget.investorConfidence,
    imfBailoutActive: budget.imfSovereignBailoutActive,
    sovereignRiskAnchor: budget.sovereignRiskAnchor,
  };
}

/**
 * The same inputs for a prior fiscal close, or null when the record did not
 * carry enough detail to break that close's rate down.
 */
export function sovereignInputsFromFiscalClose(
  close: SovereignFiscalClose | null | undefined
): SovereignRateInputs | null {
  if (
    !close ||
    !(close.gdp > 0) ||
    close.debtRate == null ||
    close.gdpGrowth == null ||
    close.inflationRate == null
  ) {
    return null;
  }
  const principal = Math.max(0, finite(close.debtPrincipal));
  return {
    debtToGdpRatio: close.debtToGdp,
    primaryBalanceToGdp: (close.revenue - close.spending + principal * close.debtRate) / close.gdp,
    realGrowthPct: close.gdpGrowth,
    inflationPct: close.inflationRate,
    investorConfidence: close.investorConfidence,
    imfBailoutActive: close.imfBailoutActive,
  };
}
