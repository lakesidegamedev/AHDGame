/** A wallet is a projection, never an additional deposit. */
export function redenominateSavings(
  source: { balance: number; accruedInterest: number; interestEarned: number },
  target: { balance: number; accruedInterest: number; interestEarned: number },
  scale: number
) {
  const values = [
    source.balance,
    source.accruedInterest,
    source.interestEarned,
    target.balance,
    target.accruedInterest,
    target.interestEarned,
    scale,
  ];
  if (values.some((value) => !Number.isFinite(value) || value < 0) || scale === 0)
    throw new Error("Savings conversion requires finite nonnegative balances and a positive rate.");
  const next = {
    balance: target.balance + source.balance * scale,
    accruedInterest: target.accruedInterest + source.accruedInterest * scale,
    interestEarned: target.interestEarned + source.interestEarned * scale,
  };
  if (Object.values(next).some((value) => !Number.isFinite(value)))
    throw new Error("Savings conversion overflow.");
  return next;
}
