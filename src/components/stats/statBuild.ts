import {
  STAT_KEYS,
  STAT_MIN,
  STAT_FREE_POINTS,
  type CharacterStats,
} from "@/lib/stats/statsConstants";

/**
 * Pure stat-build helpers, split from the allocator UI so a gate that renders
 * nothing most of the time can defer the component without losing the checks it
 * needs before the player opts in.
 */

/** Free points spent so far above the 1-floor on every stat. */
export function pointsSpent(stats: CharacterStats): number {
  return STAT_KEYS.reduce((sum, k) => sum + (stats[k] - STAT_MIN), 0);
}

/** Remaining distributable points (0 when a build is complete/legal). */
export function pointsRemaining(stats: CharacterStats): number {
  return STAT_FREE_POINTS - pointsSpent(stats);
}

/**
 * A build is flagged as lopsided once the spread between the best and worst
 * stat opens this far while at least two stats are still on the floor. Advisory
 * only — the allocation is legal, it just carries a real cost.
 */
const LOPSIDED_SPREAD = 6;

export function isLopsided(stats: CharacterStats): boolean {
  const values = STAT_KEYS.map((k) => stats[k]);
  const atFloor = values.filter((v) => v <= STAT_MIN).length;
  return Math.max(...values) - Math.min(...values) >= LOPSIDED_SPREAD && atFloor >= 2;
}

/**
 * The opening build: every stat on the floor, all {@link STAT_FREE_POINTS}
 * still to spend, so nothing is pre-assigned for the player.
 */
export function defaultStatBuild(): CharacterStats {
  return STAT_KEYS.reduce((acc, k) => {
    acc[k] = STAT_MIN;
    return acc;
  }, {} as CharacterStats);
}
