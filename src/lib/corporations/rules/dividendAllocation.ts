/** Bound distributions by both placed ownership and the corporation's actual payout pool. */
export function planDividendAllocation(input: {
  pool: number;
  totalShares: number;
  publicFloat: number;
  unplacedIpoShares: number;
  holderShares: readonly number[];
}): { holders: number[]; publicFloat: number } {
  for (const amount of [
    input.pool,
    input.totalShares,
    input.publicFloat,
    input.unplacedIpoShares,
    ...input.holderShares,
  ])
    if (!Number.isFinite(amount) || amount < 0)
      throw new Error("Invalid dividend allocation input");
  if (!(input.totalShares > 0)) throw new Error("Invalid outstanding dividend share count");
  const held = input.holderShares.reduce((sum, shares) => sum + shares, 0);
  if (!Number.isFinite(held)) throw new Error("Invalid registered dividend share count");
  // Unplaced inventory can only occupy outstanding, unheld float. A stale pre-split
  // inventory must never shrink the denominator below the actual holder register.
  const float = Math.min(input.publicFloat, Math.max(0, input.totalShares - held));
  const unplaced = Math.min(input.unplacedIpoShares, float);
  const denominator = Math.max(1, input.totalShares - unplaced, held);
  let remaining = input.pool;
  const payments = [...input.holderShares, float - unplaced].map((shares) => {
    const payment = Math.min(remaining, input.pool * (shares / denominator));
    remaining = Math.max(0, remaining - payment);
    return payment;
  });
  return { holders: payments.slice(0, -1), publicFloat: payments[payments.length - 1] };
}
