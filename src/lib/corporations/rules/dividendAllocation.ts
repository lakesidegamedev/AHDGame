import { dividendShareBasis, payFromDividendPool } from "./dividendShares";

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
  const { denominator, placedFloatShares } = dividendShareBasis(
    {
      totalShares: input.totalShares,
      publicFloat: input.publicFloat,
      pendingShareIssuance: {
        source: "ipo",
        issuedUpfront: true,
        remainingShares: input.unplacedIpoShares,
      },
    },
    input.holderShares
  );
  let paid = 0;
  const payments = [...input.holderShares, placedFloatShares].map((shares) => {
    const payment = payFromDividendPool(input.pool, paid, shares, denominator);
    paid += payment;
    return payment;
  });
  return { holders: payments.slice(0, -1), publicFloat: payments[payments.length - 1] };
}
