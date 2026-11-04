import { clamp } from "@/lib/numeric/rules";
import type { AxisPositions, PolicyShiftLedgerEntry } from "@/lib/db/types";
import { snapToPositionGrid } from "@/lib/utils/politics";

export type { AxisPositions, PolicyShiftLedgerEntry };

/** Where a bill sits on each axis; an axis nobody takes a stance on is absent. */
export interface AxisTargets {
  economic?: number;
  social?: number;
}

export type BillVote = "for" | "against" | "abstain";

/** Maximum net movement per axis a single bill may cause. */
const VOTE_SHIFT_STEP = 0.25;
const POSITION_MIN = -5;
const POSITION_MAX = 5;
const AXES = ["economic", "social"] as const;

/** Snap to the 0.05 grid and strip float noise (grid values are exact at 2 dp). */
function onGrid(value: number): number {
  return Number(snapToPositionGrid(value).toFixed(2));
}

/**
 * The bill's position on each axis: the average of every provision that takes a
 * stance there. Legacy 0 values mean "no stance" (ticket #1116); v2 explicitly
 * marks its neutral choice with includeNeutral. Omitted values are always left
 * out of the average rather than pulling it toward centre. Callers pass only the
 * provisions that carry ideology (policy provisions), never tariffs, subsidies,
 * war declarations and the like.
 */
export function billPositionTargets(
  provisions: ReadonlyArray<{ economic?: number; social?: number; includeNeutral?: boolean }>
): AxisTargets {
  const targets: AxisTargets = {};
  for (const axis of AXES) {
    const stances = provisions
      .filter((p) => typeof p[axis] === "number" && (p[axis] !== 0 || p.includeNeutral))
      .map((p) => p[axis] as number);
    if (stances.length > 0) {
      targets[axis] = stances.reduce((sum, v) => sum + v, 0) / stances.length;
    }
  }
  return targets;
}

/**
 * Net movement from `baseline` that a vote should produce.
 *
 * - Aye: toward the bill, by at most one step and never past the bill's position.
 * - Nay: away from the bill by one step.
 * - Abstain, an axis with no target, or a voter already on the bill's position: 0.
 *
 * The resulting position is clamped to the -5..+5 range and snapped to the grid.
 */
export function computeVoteShift(
  baseline: AxisPositions,
  targets: AxisTargets,
  vote: BillVote
): AxisPositions {
  const delta: AxisPositions = { economic: 0, social: 0 };
  if (vote === "abstain") return delta;
  for (const axis of AXES) {
    const target = targets[axis];
    if (target === undefined) continue;
    const distance = target - baseline[axis];
    if (distance === 0) continue;
    const magnitude =
      vote === "for" ? Math.min(VOTE_SHIFT_STEP, Math.abs(distance)) : VOTE_SHIFT_STEP;
    const direction = vote === "for" ? Math.sign(distance) : -Math.sign(distance);
    const landing = onGrid(
      clamp(baseline[axis] + direction * magnitude, POSITION_MIN, POSITION_MAX)
    );
    delta[axis] = Number((landing - baseline[axis]).toFixed(2));
  }
  return delta;
}

export interface VoteShiftPreview {
  /** Where the voter stands now. */
  current: AxisPositions;
  /** Movement from `current` if they vote Aye. */
  aye: AxisPositions;
  /** Movement from `current` if they vote Nay. */
  nay: AxisPositions;
}

/**
 * What each button would do from where the voter stands now. Once a shift has
 * been applied for this bill the move can exceed one step (Aye then Nay is a
 * half-point swing) while the net from the baseline stays within one step.
 */
export function previewVoteShift(
  current: AxisPositions,
  targets: AxisTargets,
  ledgerEntry: PolicyShiftLedgerEntry | undefined
): VoteShiftPreview {
  const baseline = ledgerEntry?.baseline ?? current;
  const applied = ledgerEntry?.applied ?? { economic: 0, social: 0 };
  const fromCurrent = (vote: BillVote): AxisPositions => {
    const next = computeVoteShift(baseline, targets, vote);
    return {
      economic: Number((next.economic - applied.economic).toFixed(2)),
      social: Number((next.social - applied.social).toFixed(2)),
    };
  };
  return { current, aye: fromCurrent("for"), nay: fromCurrent("against") };
}

/**
 * Whether a vote should touch the voter's positions. A vote recorded before the
 * ledger existed has no entry saying what it moved, so changing it cannot be
 * measured against a baseline and is left alone rather than granting a free step.
 */
export function shouldApplyVoteShift(
  previousVote: BillVote | undefined,
  ledgerEntry: PolicyShiftLedgerEntry | undefined
): boolean {
  if (ledgerEntry) return true;
  return !previousVote || previousVote === "abstain";
}

/**
 * The vote the member cast THEMSELVES, seen through any party whip that later
 * overwrote it. A whip's choice is not the member's stance: it never moved
 * their positions, so it must not count as a prior vote either. The whip
 * snapshot holds the pre-whip value ("unvoted" when there was none).
 */
export function personalPreviousVote(
  recordedVote: BillVote | undefined,
  whippedFrom: string | undefined
): BillVote | undefined {
  if (whippedFrom === undefined) return recordedVote;
  if (whippedFrom === "for" || whippedFrom === "against" || whippedFrom === "abstain") {
    return whippedFrom;
  }
  return undefined;
}
