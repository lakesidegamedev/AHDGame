/**
 * Sovereign debt dynamics: where the ratio goes and what that should cost.
 *
 *   d(t+1) = ((1 + r) / (1 + g)) * d(t) - pb
 *
 * `r` is nominal interest, `g` nominal growth and `pb` the primary balance,
 * all shares of GDP. The rollover factor's excess over 1, times `d`, is the
 * primary balance that holds the ratio flat.
 *
 * Pure: plain data in, plain data out.
 */

export type DebtTrajectory = "falling" | "stable" | "rising";

export interface DebtPathInputs {
  /** Debt/GDP as a ratio: 1.2 is 120% of GDP. */
  debtToGdp: number;
  /** Primary balance as a share of GDP: +0.02 is a 2% surplus. */
  primaryBalanceToGdp: number;
  /**
   * Nominal GDP growth in percent: 2 is 2%. Build it with
   * {@link nominalGrowthFromReal}, never from real growth alone.
   */
  nominalGrowthPct: number;
  /** Nominal interest rate in percent: 5 is 5%. */
  interestRatePct: number;
}

export interface DebtPathResult {
  /** Debt/GDP one year on, under this balance and these rates. */
  projectedDebtToGdp: number;
  /** Change in the ratio over the year: +0.035 is 3.5 points of GDP. */
  changeToGdp: number;
  /** Primary balance that would hold the ratio flat, as a share of GDP. */
  stabilisingPrimaryBalanceToGdp: number;
  trajectory: DebtTrajectory;
}

/** A change smaller than this share of GDP reads as noise, not a trend. */
export const STABLE_TRAJECTORY_BAND = 0.005;

/** Growth is clamped to a plausible band before it divides anything. */
const MIN_GROWTH_PCT = -15;
const MAX_GROWTH_PCT = 15;
const MAX_RATE_PCT = 30;

/**
 * Rate cost, in decimal points, per 1.0 of annual debt/GDP change. A country
 * adding 10 points of GDP of debt a year pays 1pp more; one shedding 10 points
 * pays less. Steep enough to matter over a couple of years, gentle enough that
 * a single bad year cannot reprice a sovereign out of the market.
 */
export const TRAJECTORY_PREMIUM_SLOPE = 0.1;

/** Bounds on the trajectory premium, in decimal rate points. */
export const TRAJECTORY_PREMIUM_MAX = 0.02;
export const TRAJECTORY_PREMIUM_MIN = -0.005;

const finiteOr = (value: unknown, fallback: number): number =>
  typeof value === "number" && Number.isFinite(value) ? value : fallback;

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

/**
 * Nominal GDP growth from real growth plus inflation.
 *
 * `economicFactors.gdpGrowth` is real, and the identity divides by nominal
 * growth, so the real rate alone understates `g`. Inflation is signed here:
 * deflation shrinks nominal GDP and raises the ratio even when real output
 * holds. The tax-base ceiling floors inflation for a revenue reason, not this.
 */
export function nominalGrowthFromReal(
  realGrowthPct: number | null | undefined,
  inflationPct: number | null | undefined
): number {
  return finiteOr(realGrowthPct, 0) + finiteOr(inflationPct, 0);
}

/**
 * Project the debt ratio one year forward and report which way it is moving.
 *
 * A negative `stabilisingPrimaryBalanceToGdp` is not a sign error: when growth
 * runs above the interest rate, a country can run a primary deficit and still
 * see its ratio fall.
 */
export function projectDebtPath(inputs: DebtPathInputs): DebtPathResult {
  const debt = Math.max(0, finiteOr(inputs.debtToGdp, 0));
  const primaryBalance = finiteOr(inputs.primaryBalanceToGdp, 0);
  const growth = clamp(finiteOr(inputs.nominalGrowthPct, 0), MIN_GROWTH_PCT, MAX_GROWTH_PCT);
  const rate = clamp(finiteOr(inputs.interestRatePct, 0), 0, MAX_RATE_PCT);

  const growthRatio = 1 + growth / 100;
  const rateRatio = 1 + rate / 100;
  const rolloverFactor = growthRatio > 0 ? rateRatio / growthRatio : rateRatio;

  const projectedDebtToGdp = Math.max(0, rolloverFactor * debt - primaryBalance);
  const changeToGdp = projectedDebtToGdp - debt;
  const stabilisingPrimaryBalanceToGdp = (rolloverFactor - 1) * debt;

  const trajectory: DebtTrajectory =
    changeToGdp > STABLE_TRAJECTORY_BAND
      ? "rising"
      : changeToGdp < -STABLE_TRAJECTORY_BAND
        ? "falling"
        : "stable";

  return {
    projectedDebtToGdp,
    changeToGdp,
    stabilisingPrimaryBalanceToGdp,
    trajectory,
  };
}

export interface DebtPathYear {
  /** Years from now: 0 is today, 1 is the next fiscal year. */
  year: number;
  debtToGdp: number;
  changeToGdp: number;
}

/** Ten years is as far as this mechanical path reads as a projection. */
const MAX_HORIZON_YEARS = 10;

/**
 * The identity applied year after year, holding the primary balance and rates at
 * today's values. Chained, not re-derived: each year's projected ratio is next
 * year's starting point, which is what makes a modest gap compound visibly.
 */
export function projectDebtPathHorizon(inputs: DebtPathInputs, years: number = 5): DebtPathYear[] {
  const horizon = clamp(Math.round(finiteOr(years, 5)), 1, MAX_HORIZON_YEARS);
  let debt = Math.max(0, finiteOr(inputs.debtToGdp, 0));
  const points: DebtPathYear[] = [{ year: 0, debtToGdp: debt, changeToGdp: 0 }];
  for (let year = 1; year <= horizon; year += 1) {
    const path = projectDebtPath({ ...inputs, debtToGdp: debt });
    points.push({ year, debtToGdp: path.projectedDebtToGdp, changeToGdp: path.changeToGdp });
    debt = path.projectedDebtToGdp;
  }
  return points;
}

/**
 * Rate premium (decimal) for the direction of the debt ratio.
 *
 * Applied on top of the credit ladder, which already prices the level. Zero for
 * a ratio that is broadly stable, so a country sitting still is charged exactly
 * what the ladder says.
 */
export function debtSustainabilityPremium(path: DebtPathResult): number {
  if (Math.abs(path.changeToGdp) <= STABLE_TRAJECTORY_BAND) return 0;
  return clamp(
    path.changeToGdp * TRAJECTORY_PREMIUM_SLOPE,
    TRAJECTORY_PREMIUM_MIN,
    TRAJECTORY_PREMIUM_MAX
  );
}

/** One sentence for the economy page: which way the ratio is going. */
export function describeDebtPath(path: DebtPathResult): string {
  if (path.trajectory === "stable") return "Debt is roughly stable against GDP.";
  const needs = path.stabilisingPrimaryBalanceToGdp;
  if (path.trajectory === "rising") {
    if (!Number.isFinite(needs)) return "Debt is rising against GDP.";
    return needs > 0
      ? `Debt is rising against GDP. A primary surplus of ${(needs * 100).toFixed(1)}% of GDP would hold it flat.`
      : "Debt is rising against GDP.";
  }
  return "Debt is falling against GDP.";
}
