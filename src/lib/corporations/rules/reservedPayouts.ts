/** Allocate whole currency units without spending beyond the held reserve. */
export function allocateReservedPayouts(weights: readonly number[], reserve: number): number[] {
  if (!Number.isFinite(reserve) || reserve < 0 || weights.some((n) => !Number.isFinite(n) || n < 0))
    throw new Error("Invalid reserved payout inputs");
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  if (!Number.isFinite(total)) throw new Error("Invalid reserved payout total");
  const budget = Math.min(Math.floor(reserve), Math.round(total));
  if (total === 0 || budget === 0) return weights.map(() => 0);
  const quotas = weights.map((weight) => (weight / total) * budget);
  const payouts = quotas.map(Math.floor);
  const remaining = budget - payouts.reduce((sum, n) => sum + n, 0);
  const order = quotas
    .map((quota, index) => ({ index, fraction: quota - payouts[index] }))
    .sort((a, b) => b.fraction - a.fraction || a.index - b.index);
  for (let i = 0; i < remaining; i++) payouts[order[i].index]++;
  return payouts;
}
