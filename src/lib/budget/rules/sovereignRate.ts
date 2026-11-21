/**
 * What a sovereign pays to borrow, and why.
 *
 * The effective rate is the level ladder for today's debt/GDP, then an investor
 * confidence premium, then the trajectory premium, all before a hard ceiling.
 * Pricing and the budget page's breakdown both call `explainSovereignRate`, so
 * the number a player sees attributed is the number the rollover charges.
 *
 * Pure rules: plain data in, plain data out.
 */

import type { CreditRating, SovereignRiskAnchor } from "@/lib/db/types/budget";
import {
  INVESTOR_CONFIDENCE_BASELINE,
  SOVEREIGN_CONFIDENCE_PREMIUM_MAX,
} from "@/lib/nationalization/constants";
import { IMF_SOVEREIGN_DEFAULT_RATE } from "@/lib/sovereignDefault/constants";
import {
  debtSustainabilityPremium,
  nominalGrowthFromReal,
  projectDebtPath,
  type DebtPathResult,
} from "./sovereignDebtSustainability";

/** Hard ceiling on the effective sovereign rate, after every premium. */
export const MAX_SOVEREIGN_RATE = 0.25;

/**
 * Debt/GDP ratio at which a sovereign degrades from the B band to CCC.
 * 250% is far above any healthy world so this only bites in runaway scenarios.
 */
export const EXTREME_DISTRESS_DEBT_TO_GDP = 2.5;

export const DEBT_THRESHOLDS = [
  {
    maxRatio: 0.6,
    rating: "AAA" as CreditRating,
    interestRate: 0.02,
    gdpPenalty: 0,
    trustPenalty: 0,
  },
  {
    maxRatio: 0.8,
    rating: "AA" as CreditRating,
    interestRate: 0.025,
    gdpPenalty: 0,
    trustPenalty: 0,
  },
  {
    maxRatio: 1.0,
    rating: "A" as CreditRating,
    interestRate: 0.035,
    gdpPenalty: 0.1,
    trustPenalty: 0,
  },
  {
    maxRatio: 1.2,
    rating: "BBB" as CreditRating,
    interestRate: 0.05,
    gdpPenalty: 0.2,
    trustPenalty: 0,
  },
  {
    maxRatio: 1.5,
    rating: "BB" as CreditRating,
    interestRate: 0.07,
    gdpPenalty: 0.3,
    trustPenalty: 5,
  },
  {
    maxRatio: EXTREME_DISTRESS_DEBT_TO_GDP,
    rating: "B" as CreditRating,
    interestRate: 0.1,
    gdpPenalty: 0.5,
    trustPenalty: 10,
  },
  // Extreme-distress band: sustained debt/GDP beyond 250% drops the sovereign
  // to CCC, the floor the rating type supports (post-default repudiation also
  // stamps CCC). Well above any live-world ratio, so behavior below is unchanged.
  {
    maxRatio: Infinity,
    rating: "CCC" as CreditRating,
    interestRate: 0.14,
    gdpPenalty: 0.7,
    trustPenalty: 15,
  },
];

/**
 * Return the current debt/GDP ratio used by the risk ladder.
 *
 * `sovereignRiskAnchor` remains on persisted budgets for seed and migration
 * provenance, and the optional argument is retained for compatibility with
 * older callers. It must not rescale current risk: a country's authored
 * starting position is not its current credit risk.
 *
 * @deprecated Use the current smoothed debt/GDP ratio directly. The name is
 * retained so older integrations do not silently change shape.
 */
function normalizeDebtToGdpForRisk(debtToGdpRatio: number, _anchor?: SovereignRiskAnchor): number {
  return Math.max(0, debtToGdpRatio);
}

export function getDebtThreshold(debtToGdpRatio: number, anchor?: SovereignRiskAnchor) {
  const assessedRatio = normalizeDebtToGdpForRisk(debtToGdpRatio, anchor);
  return (
    DEBT_THRESHOLDS.find((t) => assessedRatio <= t.maxRatio) ||
    DEBT_THRESHOLDS[DEBT_THRESHOLDS.length - 1]
  );
}

export function calculateCreditRating(
  debtToGdpRatio: number,
  anchor?: SovereignRiskAnchor
): CreditRating {
  return getDebtThreshold(debtToGdpRatio, anchor).rating;
}

/**
 * Interest rate for a given debt/GDP ratio, capped at the concessional IMF
 * sovereign-facility rate whenever an IMF bailout program is active on the
 * country.
 *
 * The top tier's flat 14% has no ceiling on ratio — by design, since it's
 * meant to price genuine market distress, not to be a stable steady state.
 * A real IMF program's whole point is cheaper financing than the market will
 * offer — the tier rate should never outrank the program rate while one is in
 * force.
 */
export function calculateInterestRate(
  debtToGdpRatio: number,
  imfBailoutActive?: boolean,
  _anchor?: SovereignRiskAnchor
): number {
  const ladderRate = getDebtThreshold(debtToGdpRatio, _anchor).interestRate;
  // The current tier is the market rate. Historical seed anchors do not
  // rescale it; otherwise a low starting ratio can turn a healthy current
  // debt/GDP level into an artificial distress rate.
  const tierRate = ladderRate;
  return imfBailoutActive ? Math.min(tierRate, IMF_SOVEREIGN_DEFAULT_RATE) : tierRate;
}

/**
 * Sovereign interest-rate premium (decimal) from low investor confidence
 * (spec §12.4 feed 2). 0 at/above baseline; rises to SOVEREIGN_CONFIDENCE_PREMIUM_MAX
 * at confidence 0 — expropriation fear makes the government's own borrowing pricier.
 */
export function getSovereignConfidencePremium(
  investorConfidence: number | null | undefined
): number {
  if (investorConfidence == null || !Number.isFinite(investorConfidence)) return 0;
  if (investorConfidence >= INVESTOR_CONFIDENCE_BASELINE) return 0;
  const below = INVESTOR_CONFIDENCE_BASELINE - Math.max(0, investorConfidence);
  return SOVEREIGN_CONFIDENCE_PREMIUM_MAX * (below / INVESTOR_CONFIDENCE_BASELINE);
}

export interface SovereignRateInputs {
  /** Debt/GDP as a ratio: 1.2 is 120% of GDP. */
  debtToGdpRatio: number;
  /** Primary balance as a share of GDP: +0.02 is a 2% surplus. */
  primaryBalanceToGdp: number;
  /** Real growth, as stored on the budget. Inflation is added by the rule. */
  realGrowthPct: number | null | undefined;
  inflationPct: number | null | undefined;
  investorConfidence: number | null | undefined;
  imfBailoutActive: boolean | null | undefined;
  sovereignRiskAnchor?: SovereignRiskAnchor;
}

export interface SovereignRateBreakdown {
  /** Ladder rate for the current debt/GDP, before the IMF programme cap. */
  ladderRate: number;
  ladderRating: CreditRating;
  /** True when an IMF programme prices the ladder below its own tier. */
  imfCapApplied: boolean;
  /** Ladder rate after the IMF programme cap. */
  afterImfCapRate: number;
  /** Extra rate points from low investor confidence. */
  confidencePremium: number;
  /** Extra rate points (or discount, when negative) from the debt trajectory. */
  trajectoryPremium: number;
  /** Sum before the hard ceiling. */
  uncappedRate: number;
  /** What the rollover actually charges. */
  effectiveRate: number;
  /** True when the hard ceiling trimmed the sum. */
  maxCapApplied: boolean;
  /** The debt path the trajectory premium was read from. */
  path: DebtPathResult;
}

/**
 * Attribute the effective sovereign rate to the ladder, confidence, trajectory
 * and caps. Uses the ladder rate for the identity, exactly as the rollover does:
 * the trajectory premium is a direction signal, not a compounding rate.
 */
export function explainSovereignRate(inputs: SovereignRateInputs): SovereignRateBreakdown {
  const threshold = getDebtThreshold(inputs.debtToGdpRatio, inputs.sovereignRiskAnchor);
  const ladderRate = threshold.interestRate;
  const imfCapApplied = inputs.imfBailoutActive === true && ladderRate > IMF_SOVEREIGN_DEFAULT_RATE;
  const afterImfCapRate = imfCapApplied ? IMF_SOVEREIGN_DEFAULT_RATE : ladderRate;

  const path = projectDebtPath({
    debtToGdp: inputs.debtToGdpRatio,
    primaryBalanceToGdp: inputs.primaryBalanceToGdp,
    nominalGrowthPct: nominalGrowthFromReal(inputs.realGrowthPct, inputs.inflationPct),
    interestRatePct: afterImfCapRate * 100,
  });

  const confidencePremium = getSovereignConfidencePremium(inputs.investorConfidence);
  const trajectoryPremium = debtSustainabilityPremium(path);
  const uncappedRate = afterImfCapRate + confidencePremium + trajectoryPremium;
  const effectiveRate = Math.max(0, Math.min(MAX_SOVEREIGN_RATE, uncappedRate));

  return {
    ladderRate,
    ladderRating: threshold.rating,
    imfCapApplied,
    afterImfCapRate,
    confidencePremium,
    trajectoryPremium,
    uncappedRate,
    effectiveRate,
    maxCapApplied: uncappedRate > MAX_SOVEREIGN_RATE,
    path,
  };
}
