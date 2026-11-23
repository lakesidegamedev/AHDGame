/**
 * The last recorded move in a company's average quality, from its turn
 * snapshots. Plain data in, plain data out.
 */

export interface QualityPoint {
  turn: number;
  value: number;
}

export interface QualityChange {
  /** The score before the move. */
  from: number;
  /** The turn that carried the earlier score. */
  fromTurn: number;
  /** Signed points moved, rounded to one decimal. */
  delta: number;
}

/** Moves smaller than this are not worth a note. */
export const QUALITY_CHANGE_MIN_POINTS = 1;

/**
 * Compare the live score with the newest snapshot that differs from it, given
 * snapshots newest first. Null when the score has not moved by a visible amount.
 */
export function lastQualityChange(
  live: number,
  snapshotsNewestFirst: readonly QualityPoint[]
): QualityChange | null {
  if (!Number.isFinite(live)) return null;
  const earlier = snapshotsNewestFirst.find(
    (p) => Number.isFinite(p.value) && Math.abs(p.value - live) >= QUALITY_CHANGE_MIN_POINTS
  );
  if (!earlier) return null;
  return {
    from: Math.round(earlier.value * 10) / 10,
    fromTurn: earlier.turn,
    delta: Math.round((live - earlier.value) * 10) / 10,
  };
}
