/** The first committed point owns a period; stale or repeated publications cannot reprice it. */
export function appendTurnHistory<T extends { turn: number }>(
  path: string,
  point: T,
  cap: number
): Record<string, unknown> {
  if (!Number.isSafeInteger(point.turn) || point.turn < 0 || !Number.isSafeInteger(cap) || cap < 1)
    throw new Error("Invalid turn history boundary");
  const series = { $ifNull: [`$${path}`, []] };
  const latest = { $max: { $map: { input: series, as: "point", in: "$$point.turn" } } };
  return {
    $cond: [
      { $gte: [{ $ifNull: [latest, -1] }, point.turn] },
      series,
      { $slice: [{ $concatArrays: [series, { $literal: [point] }] }, -cap] },
    ],
  };
}

/** Legacy duplicate periods retain the same first-publication meaning as new writes. */
export function uniqueTurnHistory<T extends { turn: number }>(points: readonly T[]): T[] {
  const byTurn = new Map<number, T>();
  for (const point of points)
    if (Number.isSafeInteger(point?.turn) && point.turn >= 0 && !byTurn.has(point.turn))
      byTurn.set(point.turn, point);
  return [...byTurn.values()].sort((a, b) => a.turn - b.turn);
}
