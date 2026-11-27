/** A receipt may certify cash only when the stored number actually changes finitely. */
export function representedCashDelta(path: string, delta: number): Record<string, unknown> {
  if (!Number.isFinite(delta)) throw new Error("Cash delta must be finite");
  if (delta === 0) return {};
  const balance = { $ifNull: [`$${path}`, 0] };
  const next = { $add: [balance, delta] };
  return {
    $expr: { $and: [{ $ne: [next, balance] }, { $lte: [{ $abs: next }, Number.MAX_VALUE] }] },
  };
}
