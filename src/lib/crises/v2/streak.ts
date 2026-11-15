/** How many consecutive turns a condition has held, as stored between turns. */
export interface StreakRecord {
  count: number;
  lastTurn: number;
}

/**
 * Next streak for a condition. A turn where it does not hold, or a gap in the
 * turns seen, starts over. Seeing the same turn twice changes nothing.
 */
export function advanceStreak(
  prev: StreakRecord | undefined,
  holds: boolean,
  turn: number
): StreakRecord | null {
  if (!holds) return null;
  if (!prev) return { count: 1, lastTurn: turn };
  if (prev.lastTurn === turn) return prev;
  if (prev.lastTurn === turn - 1) return { count: prev.count + 1, lastTurn: turn };
  return { count: 1, lastTurn: turn };
}
