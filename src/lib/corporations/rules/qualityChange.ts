/**
 * The last recorded move in a company's average quality, from its turn
 * snapshots. Plain data in, plain data out.
 */

import type { QualityPillarKey, QualityPillars } from "@/lib/market/brandQuality";
import { QUALITY_PILLAR_KEYS } from "@/lib/market/brandQuality";

export interface QualityPoint {
  turn: number;
  value: number;
  /** Pillar scores recorded with the snapshot; absent on older rows. */
  pillars?: QualityPillars;
}

export interface QualityChange {
  /** The score before the move. */
  from: number;
  /** The turn that carried the earlier score. */
  fromTurn: number;
  /** Signed points moved, rounded to one decimal. */
  delta: number;
  /** The pillar whose score moved most between the two snapshots, when both recorded pillars. */
  biggestPillar?: { key: QualityPillarKey; delta: number };
}

/** Pillar moves smaller than this are rounding noise. */
export const PILLAR_MOVE_MIN_POINTS = 0.5;

/** The pillar with the largest absolute move from `before` to `after`, or null. */
export function biggestPillarMove(
  before: QualityPillars | undefined,
  after: QualityPillars | undefined
): { key: QualityPillarKey; delta: number } | null {
  if (!before || !after) return null;
  let best: { key: QualityPillarKey; delta: number } | null = null;
  for (const key of QUALITY_PILLAR_KEYS) {
    const delta = Math.round((after[key] - before[key]) * 10) / 10;
    if (!Number.isFinite(delta) || Math.abs(delta) < PILLAR_MOVE_MIN_POINTS) continue;
    if (!best || Math.abs(delta) > Math.abs(best.delta)) best = { key, delta };
  }
  return best;
}

/** Moves smaller than this are not worth a note. */
export const QUALITY_CHANGE_MIN_POINTS = 1;

/**
 * Compare the live score with the newest snapshot that differs from it, given
 * snapshots newest first. Null when the score has not moved by a visible amount.
 */
export function lastQualityChange(
  live: number,
  snapshotsNewestFirst: readonly QualityPoint[],
  livePillars?: QualityPillars
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
    ...(biggestPillarMove(earlier.pillars, livePillars) && {
      biggestPillar: biggestPillarMove(earlier.pillars, livePillars)!,
    }),
  };
}

export interface QualityHistoryRow {
  turn: number;
  averageQuality?: number;
  qualityPillars?: QualityPillars;
}

/**
 * Quality change from history rows, newest first. The newest row carries the
 * live score and its pillars, so its pillars stand in for the live pillars.
 */
export function lastQualityChangeFromHistory(
  live: number,
  rowsNewestFirst: readonly QualityHistoryRow[]
): QualityChange | undefined {
  return (
    lastQualityChange(
      live,
      rowsNewestFirst.map((row) => ({
        turn: row.turn,
        value: row.averageQuality ?? Number.NaN,
        pillars: row.qualityPillars,
      })),
      rowsNewestFirst[0]?.qualityPillars
    ) ?? undefined
  );
}

/** The newest recorded pillar scores, and what moved since the last row that also had them. */
export interface QualityPillarsView {
  turn: number;
  pillars: QualityPillars;
  /** The next older row that recorded pillars, when there is one. */
  previousTurn?: number;
  mover?: { key: QualityPillarKey; delta: number };
}

/**
 * Pillars of the newest history row, always shown when that row has them. The
 * mover is named only when an older row also recorded pillars.
 */
export function qualityPillarsView(
  rowsNewestFirst: readonly QualityHistoryRow[]
): QualityPillarsView | undefined {
  const newest = rowsNewestFirst[0];
  if (!newest?.qualityPillars) return undefined;
  const previous = rowsNewestFirst.slice(1).find((row) => row.qualityPillars);
  const mover = previous ? biggestPillarMove(previous.qualityPillars, newest.qualityPillars) : null;
  return {
    turn: newest.turn,
    pillars: newest.qualityPillars,
    ...(previous ? { previousTurn: previous.turn } : {}),
    ...(mover ? { mover } : {}),
  };
}
