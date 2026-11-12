/**
 * Bounds of a legislation type's policy-option ladder.
 *
 * Ladder lengths vary (most seven, redistricting three), and an out-of-range
 * index is not inert because readers reinterpret it. Shared by the order
 * route, order modal and bill-proposal modals so shown options and the
 * resolved index cannot drift apart.
 *
 * `centerIndex` is the floor midpoint, matching billEnactment. Deliberately
 * NOT `ladderCenterIndex` (centre-STANCE), which would move the default off 3
 * for existing seven-option ladders. A seven-option ladder yields 0-6/centre-3.
 *
 * No-options types keep the legacy 0-6 bounds rather than collapsing.
 */
export interface LadderBounds {
  /** Highest selectable option index. */
  maxIndex: number;
  /** Index used when a state has no prior policy for the type. */
  centerIndex: number;
}

const LEGACY_LADDER_BOUNDS: LadderBounds = { maxIndex: 6, centerIndex: 3 };

export function ladderBounds(optionCount: number | undefined | null): LadderBounds {
  if (!Number.isInteger(optionCount) || (optionCount as number) <= 0) {
    return LEGACY_LADDER_BOUNDS;
  }
  const n = optionCount as number;
  return { maxIndex: n - 1, centerIndex: Math.floor(n / 2) };
}
