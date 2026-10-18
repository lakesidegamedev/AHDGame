/**
 * Investment on expected settled margin (market recovery plan, phase 6), for
 * the unified producer market. Replaces shortage scores, sell-out tests and
 * founding gates with one question per plant: would another unit of capacity
 * pay for itself at today's prices?
 *
 * - The plant must have sold out last turn (there is demand it could not
 *   serve) and run near full (capacity, not inputs or demand, was the limit).
 * - The expected margin of one more unit, at the reference price, after its
 *   inputs, labour and site cost per unit and the build cost spread over the
 *   payback horizon, must clear a hurdle.
 * - The expansion is a share of current capacity, larger when the margin is
 *   larger, capped per turn.
 *
 * Pure: last receipt, prices and costs in, an expansion share out.
 */

export const INVESTMENT_HURDLE = 0.08;
export const INVESTMENT_MAX_SHARE = 0.05;
export const INVESTMENT_PAYBACK_TURNS = 240;
export const INVESTMENT_SOLD_OUT = 0.98;
export const INVESTMENT_RUN_NEAR_FULL = 0.9;

export interface InvestmentInput {
  activeUnits: number;
  producedUnits: number;
  offeredUnits: number;
  soldUnits: number;
  /** Reference price of the plant's output basket per unit of output, this turn. */
  referenceUnitPrice: number;
  /** Inputs, labour and site cost per unit of output at a full run. */
  unitOperatingCost: number;
  /** Build cost of one unit of capacity. */
  unitBuildCost: number;
}

/** Expected margin of one more unit of capacity at the reference price. */
export function marginalUnitMargin(i: InvestmentInput): number {
  if (!(i.referenceUnitPrice > 0)) return -1;
  const capitalPerTurn = Math.max(0, i.unitBuildCost) / INVESTMENT_PAYBACK_TURNS;
  return (
    (i.referenceUnitPrice - Math.max(0, i.unitOperatingCost) - capitalPerTurn) /
    i.referenceUnitPrice
  );
}

/** Share of current capacity to add this turn (0 = do not build). */
export function expansionShare(i: InvestmentInput): number {
  const finite = (x: number) => (Number.isFinite(x) ? x : 0);
  const active = finite(i.activeUnits);
  if (!(active > 0)) return 0;
  const run = finite(i.producedUnits) / active;
  const offered = finite(i.offeredUnits);
  const sellThrough = offered > 0 ? finite(i.soldUnits) / offered : 0;
  if (sellThrough < INVESTMENT_SOLD_OUT || run < INVESTMENT_RUN_NEAR_FULL) return 0;
  const margin = marginalUnitMargin(i);
  if (!(margin > INVESTMENT_HURDLE)) return 0;
  // Scale from 0 at the hurdle to the cap at twice the hurdle.
  return Math.min(
    INVESTMENT_MAX_SHARE,
    (INVESTMENT_MAX_SHARE * (margin - INVESTMENT_HURDLE)) / INVESTMENT_HURDLE
  );
}
