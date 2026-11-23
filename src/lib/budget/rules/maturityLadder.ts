/**
 * When the sovereign's outstanding debt reprices.
 *
 * The trajectory premium only reaches the budget as coupons roll: a bond keeps
 * the rate it was issued at until it matures, and the fiscal-year rollover
 * prices new issuance off today's effective rate. This groups outstanding face
 * by the fiscal year it matures in, so a treasury can see how much of the stock
 * is about to move to today's rate and what that costs.
 *
 * Pure rules: bond rows in, buckets out. No database or clock.
 */

/** One outstanding sovereign bond, as far as the ladder needs it. */
export interface SovereignMaturityBond {
  /** Outstanding face, country-local currency. */
  principal: number;
  /** Coupon the stock pays today, in percent. */
  couponRatePct: number;
  /** Turn the bond matures. */
  maturityTurn: number;
}

export interface MaturityLadderYear {
  /** 0 is the fiscal year in progress, 1 the next close, and so on. */
  fyOffset: number;
  principal: number;
  /** Share of the outstanding stock maturing this year, 0..1. */
  share: number;
  /** What this face pays in coupons at its issued rates, per year. */
  couponCost: number;
  /** What the same face would cost per year at today's rate. */
  repricedCost: number;
  /** The coupon this face pays on average, in percent. */
  averageCouponPct: number;
  /** Today's effective rate minus that average, in points. Positive costs more. */
  repricingGapPct: number;
}

export interface SovereignMaturityLadder {
  years: MaturityLadderYear[];
  /** Face maturing beyond the horizon, so the total still reconciles. */
  beyondPrincipal: number;
  /** Annual coupons on the face beyond the horizon, so coupons reconcile too. */
  beyondCouponCost: number;
  totalPrincipal: number;
  /** Annual coupons across the whole stock: the interest the coupon book charges. */
  totalCouponCost: number;
  /** Total coupons over total face, in percent: the rate actually charged. */
  averageCouponPct: number;
  todayRatePct: number;
}

export const LADDER_HORIZON_YEARS = 6;

const finiteOr = (value: unknown, fallback: number): number =>
  typeof value === "number" && Number.isFinite(value) ? value : fallback;

/**
 * Bucket outstanding bonds by fiscal year to maturity.
 *
 * A bond already due (maturity at or before now) falls into this fiscal year,
 * because it reprices at the next close. Anything past the horizon is reported
 * as `beyondPrincipal` rather than being folded into the last column, which
 * would overstate that year.
 */
export function sovereignMaturityLadder(
  bonds: readonly SovereignMaturityBond[] | undefined,
  options: {
    currentTurn: number;
    /** The effective rate new borrowing pays, in percent. */
    todayRatePct: number;
    turnsPerYear?: number;
    horizonYears?: number;
  }
): SovereignMaturityLadder {
  const turnsPerYear = Math.max(1, Math.round(finiteOr(options.turnsPerYear, 48)));
  const horizon = Math.max(1, Math.round(finiteOr(options.horizonYears, LADDER_HORIZON_YEARS)));
  const todayRatePct = Math.max(0, finiteOr(options.todayRatePct, 0));
  const currentTurn = finiteOr(options.currentTurn, 0);

  const rows = (bonds ?? []).filter(
    (bond) =>
      Number.isFinite(bond.principal) &&
      Number.isFinite(bond.couponRatePct) &&
      Number.isFinite(bond.maturityTurn) &&
      bond.principal > 0
  );

  const years: MaturityLadderYear[] = Array.from({ length: horizon }, (_, fyOffset) => ({
    fyOffset,
    principal: 0,
    share: 0,
    couponCost: 0,
    repricedCost: 0,
    averageCouponPct: 0,
    repricingGapPct: 0,
  }));
  let beyondPrincipal = 0;
  let beyondCouponCost = 0;
  let totalPrincipal = 0;
  let totalCouponCost = 0;

  for (const bond of rows) {
    const turnsUntil = bond.maturityTurn - currentTurn;
    const offset = Math.floor(Math.max(0, turnsUntil) / turnsPerYear);
    const bucket = offset >= horizon ? null : years[offset];
    const coupon = (bond.principal * bond.couponRatePct) / 100;
    const repriced = (bond.principal * todayRatePct) / 100;
    totalPrincipal += bond.principal;
    totalCouponCost += coupon;
    if (!bucket) {
      beyondPrincipal += bond.principal;
      beyondCouponCost += coupon;
      continue;
    }
    bucket.principal += bond.principal;
    bucket.couponCost += coupon;
    bucket.repricedCost += repriced;
  }

  for (const year of years) {
    year.share = totalPrincipal > 0 ? year.principal / totalPrincipal : 0;
    year.averageCouponPct = year.principal > 0 ? (year.couponCost / year.principal) * 100 : 0;
    year.repricingGapPct = year.principal > 0 ? todayRatePct - year.averageCouponPct : 0;
  }

  return {
    years,
    beyondPrincipal,
    beyondCouponCost,
    totalPrincipal,
    totalCouponCost,
    averageCouponPct: totalPrincipal > 0 ? (totalCouponCost / totalPrincipal) * 100 : 0,
    todayRatePct,
  };
}

export interface MaturityLadderHighlights {
  /** Year repricing the largest share of the outstanding stock. */
  largestShare: MaturityLadderYear | null;
  /** Year whose coupons sit furthest below today's rate, when any does. */
  widestGap: MaturityLadderYear | null;
}

/**
 * The years a treasury can act on: the one repricing the most face, and the one
 * repricing at the widest gap above its own coupons. A gap at or below zero is
 * a discount, so it is not reported as a cost to plan for.
 */
export function maturityLadderHighlights(
  ladder: SovereignMaturityLadder
): MaturityLadderHighlights {
  let largestShare: MaturityLadderYear | null = null;
  let widestGap: MaturityLadderYear | null = null;
  for (const year of ladder.years) {
    if (year.principal <= 0) continue;
    if (!largestShare || year.share > largestShare.share) largestShare = year;
    if (
      year.repricingGapPct > 0 &&
      (!widestGap || year.repricingGapPct > widestGap.repricingGapPct)
    ) {
      widestGap = year;
    }
  }
  return { largestShare, widestGap };
}
