/**
 * Share-count rules for dividends and for every other "who owns this company"
 * fraction that has to exclude IPO shares issued but not yet bought.
 *
 * Pure: plain data in, plain data out.
 *
 * An upfront IPO adds its shares to totalShares and publicFloat at once and
 * records the unsold part in pendingShareIssuance.remainingShares. Those
 * unsold shares sit inside the float, so they can never exceed it. A stored
 * remainder above the float (or above totalShares) is corrupt, and subtracting
 * it raw collapses the placed-share denominator toward zero.
 */

export type PendingIssuanceLike = {
  remainingShares?: number;
  source?: string;
  issuedUpfront?: boolean;
};

export type ShareCountsLike = {
  totalShares?: number | null;
  publicFloat?: number | null;
  pendingShareIssuance?: PendingIssuanceLike | null;
};

function nonNegative(value: number | null | undefined): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : 0;
}

/**
 * Upfront IPO shares that are issued but have no holder yet, clamped to the
 * float and to totalShares so a corrupt remainder cannot exceed the shares it
 * is supposed to be part of.
 */
export function unplacedIpoShares(corp: ShareCountsLike): number {
  const pending = corp.pendingShareIssuance;
  if (!pending?.issuedUpfront || pending.source !== "ipo") return 0;
  return Math.min(
    nonNegative(pending.remainingShares),
    nonNegative(corp.publicFloat),
    nonNegative(corp.totalShares)
  );
}

export type DividendShareBasis = {
  /** Shares that earn a dividend: never below the sum of holder shares plus placed float. */
  denominator: number;
  /** Float shares held by the market pool (placed), which earn the pool's dividend. */
  placedFloatShares: number;
};

export function dividendShareBasis(
  corp: ShareCountsLike,
  holderShares: readonly number[],
  fallbackTotalShares = 0
): DividendShareBasis {
  const total =
    typeof corp.totalShares === "number" ? nonNegative(corp.totalShares) : fallbackTotalShares;
  const unplaced = unplacedIpoShares({ ...corp, totalShares: total });
  const holdersTotal = holderShares.reduce((sum, shares) => sum + nonNegative(shares), 0);
  const placedFloatShares = Math.max(0, nonNegative(corp.publicFloat) - unplaced);
  const denominator = Math.max(1, total - unplaced, holdersTotal + placedFloatShares);
  return { denominator, placedFloatShares };
}

/** A holder's fraction of the dividend pool, capped at the whole pool. */
export function dividendShareFraction(shares: number, denominator: number): number {
  if (!(denominator > 0)) return 0;
  return Math.min(1, nonNegative(shares) / denominator);
}

/**
 * Pays one recipient out of a fixed pool. The amount is the holder's capped
 * fraction of the pool, further limited to what the pool has left, so the sum
 * of every payment can never exceed the pool however the inputs drift.
 */
export function payFromDividendPool(
  pool: number,
  alreadyPaid: number,
  shares: number,
  denominator: number
): number {
  const remaining = Math.max(0, pool - alreadyPaid);
  return Math.min(remaining, pool * dividendShareFraction(shares, denominator));
}

export type ScalablePendingIssuance = PendingIssuanceLike & {
  remainingShares: number;
  requestedShares: number;
  initialPriceLocal: number;
};

/**
 * Rescales a pending share issuance through a split or consolidation. Share
 * counts scale by newTotal / oldTotal and the offer price by the inverse, so
 * the issue keeps its value. An upfront IPO remainder is part of the float, so
 * it is also clamped to the new float.
 */
export function scalePendingIssuanceForStructureChange<T extends ScalablePendingIssuance>(
  pending: T,
  oldTotalShares: number,
  newTotalShares: number,
  newPublicFloat: number
): T {
  if (!(oldTotalShares > 0) || !(newTotalShares > 0)) return pending;
  const ratio = newTotalShares / oldTotalShares;
  let remainingShares = Math.floor(nonNegative(pending.remainingShares) * ratio);
  if (pending.issuedUpfront && pending.source === "ipo") {
    remainingShares = Math.min(remainingShares, nonNegative(newPublicFloat));
  }
  return {
    ...pending,
    remainingShares,
    requestedShares: Math.max(
      remainingShares,
      Math.round(nonNegative(pending.requestedShares) * ratio)
    ),
    initialPriceLocal: Math.round((nonNegative(pending.initialPriceLocal) / ratio) * 100) / 100,
  };
}
