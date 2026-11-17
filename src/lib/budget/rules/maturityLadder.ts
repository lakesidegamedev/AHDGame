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
}

export interface SovereignMaturityLadder {
  years: MaturityLadderYear[];
  /** Face maturing beyond the horizon, so the total still reconciles. */
  beyondPrincipal: number;
  totalPrincipal: number;
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
  }));
  let beyondPrincipal = 0;
  let totalPrincipal = 0;

  for (const bond of rows) {
    const turnsUntil = bond.maturityTurn - currentTurn;
    const offset = Math.floor(Math.max(0, turnsUntil) / turnsPerYear);
    const bucket = offset >= horizon ? null : years[offset];
    const coupon = (bond.principal * bond.couponRatePct) / 100;
    const repriced = (bond.principal * todayRatePct) / 100;
    totalPrincipal += bond.principal;
    if (!bucket) {
      beyondPrincipal += bond.principal;
      continue;
    }
    bucket.principal += bond.principal;
    bucket.couponCost += coupon;
    bucket.repricedCost += repriced;
  }

  for (const year of years) {
    year.share = totalPrincipal > 0 ? year.principal / totalPrincipal : 0;
  }

  return { years, beyondPrincipal, totalPrincipal, todayRatePct };
}
