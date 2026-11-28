/** Preserve sub-cent cash while bounding distributions by the funded pool. */
export function dividendRemainder(pool: number, paid: number): number {
  if (![pool, paid].every(Number.isFinite) || pool < 0 || paid < 0)
    throw new Error("Invalid dividend cash remainder");
  return Math.max(0, pool - paid);
}

export function cappedUnitDividend(
  pool: number,
  paid: number,
  units: number,
  perUnit: number
): number {
  if (![units, perUnit].every(Number.isFinite) || units < 0 || perUnit < 0) return 0;
  return Math.min(dividendRemainder(pool, paid), Math.floor(units * perUnit * 100) / 100);
}
