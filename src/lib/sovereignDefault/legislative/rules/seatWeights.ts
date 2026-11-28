/** Each represented mandate contributes once, regardless of its actor's other offices. */
export function chamberSeatWeights(
  rows: readonly { actorId: string; seatsHeld?: number }[]
): Map<string, number> {
  const weights = new Map<string, number>();
  for (const row of rows) {
    const seats = row.seatsHeld ?? 1;
    if (!row.actorId || !Number.isSafeInteger(seats) || seats <= 0) continue;
    weights.set(row.actorId, (weights.get(row.actorId) ?? 0) + seats);
  }
  return weights;
}
