const toleranceFor = (delta: number) => Math.max(0.005, Math.abs(delta) * 1e-12);

export function cashDeltaIsRepresented(balance: number, delta: number): boolean {
  const next = balance + delta;
  return (
    Number.isFinite(balance) &&
    Number.isFinite(next) &&
    (delta === 0 || (next !== balance && Math.abs(next - balance - delta) <= toleranceFor(delta)))
  );
}

/** Reject rounded mutations beyond half a native cent or flow-relative rounding noise. */
export function representedCashDelta(path: string, delta: number): Record<string, unknown> {
  if (!Number.isFinite(delta)) throw new Error("Cash delta must be finite");
  if (delta === 0) return {};
  const balance = { $ifNull: [`$${path}`, 0] };
  const next = { $add: [balance, delta] };
  const tolerance = toleranceFor(delta);
  return {
    $expr: {
      $and: [
        { $ne: [next, balance] },
        { $lte: [{ $abs: next }, Number.MAX_VALUE] },
        { $lte: [{ $abs: { $subtract: [{ $subtract: [next, balance] }, delta] } }, tolerance] },
      ],
    },
  };
}
