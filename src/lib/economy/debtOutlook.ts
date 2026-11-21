/**
 * The four debt figures a comparison card needs, from one breakdown.
 *
 * The effective rate and the trend come from `explainSovereignRate`, the same
 * composer the rollover and the budget page use. The five-year ratio chains the
 * debt-dynamics identity at the rate the path is actually priced at, so the
 * figure shown here cannot disagree with the budget page chart.
 *
 * Pure: budget ratios in, display percentages out.
 */

import type { SovereignRiskAnchor } from "@/lib/db/types/budget";
import { explainSovereignRate, type SovereignRateInputs } from "@/lib/budget/rules/sovereignRate";
import {
  nominalGrowthFromReal,
  projectDebtPathHorizon,
  type DebtTrajectory,
} from "@/lib/budget/rules/sovereignDebtSustainability";

/** How far the comparison card projects. */
export const DEBT_OUTLOOK_HORIZON_YEARS = 5;

export interface DebtOutlookInputs {
  /** Debt/GDP as a ratio: 1.2 is 120% of GDP. */
  debtToGdpRatio: number;
  /** Primary balance as a share of GDP: +0.02 is a 2% surplus. */
  primaryBalanceToGdp: number;
  realGrowthPct: number | null | undefined;
  inflationPct: number | null | undefined;
  investorConfidence: number | null | undefined;
  imfBailoutActive: boolean | null | undefined;
  sovereignRiskAnchor?: SovereignRiskAnchor;
}

export interface DebtOutlook {
  /** What the sovereign pays today, after confidence and trajectory premiums. */
  effectiveRatePct: number;
  /** Debt/GDP five years on, holding today's primary balance and rates. */
  projectedDebtToGdpPct: number;
  trajectory: DebtTrajectory;
  /** Primary balance that holds the ratio flat, as a signed percent of GDP. */
  stabilisingPrimaryBalancePct: number;
  /** Ladder rate the projection rolls over at, before premiums. */
  basisRatePct: number;
}

const finite = (value: number | null | undefined): number =>
  typeof value === "number" && Number.isFinite(value) ? value : 0;

export function buildDebtOutlook(inputs: DebtOutlookInputs): DebtOutlook | null {
  const debtToGdpRatio = finite(inputs.debtToGdpRatio);
  if (!(debtToGdpRatio > 0)) return null;

  const rateInputs: SovereignRateInputs = {
    debtToGdpRatio,
    primaryBalanceToGdp: finite(inputs.primaryBalanceToGdp),
    realGrowthPct: inputs.realGrowthPct,
    inflationPct: inputs.inflationPct,
    investorConfidence: inputs.investorConfidence,
    imfBailoutActive: inputs.imfBailoutActive,
    sovereignRiskAnchor: inputs.sovereignRiskAnchor,
  };
  const rate = explainSovereignRate(rateInputs);

  // Rollover priced at the path's own basis, not the premium-laden effective
  // rate: premiums signal direction, they are not a compounding cost.
  const horizon = projectDebtPathHorizon(
    {
      debtToGdp: debtToGdpRatio,
      primaryBalanceToGdp: rateInputs.primaryBalanceToGdp,
      nominalGrowthPct: nominalGrowthFromReal(inputs.realGrowthPct, inputs.inflationPct),
      interestRatePct: rate.afterImfCapRate * 100,
    },
    DEBT_OUTLOOK_HORIZON_YEARS
  );
  const last = horizon[horizon.length - 1];

  return {
    effectiveRatePct: rate.effectiveRate * 100,
    projectedDebtToGdpPct: last.debtToGdp * 100,
    trajectory: rate.path.trajectory,
    stabilisingPrimaryBalancePct: rate.path.stabilisingPrimaryBalanceToGdp * 100,
    basisRatePct: rate.afterImfCapRate * 100,
  };
}
