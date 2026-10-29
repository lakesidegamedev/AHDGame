/** A completed dissolution election gives the next government a neutral starting point. */
export const POST_SNAP_CONFIDENCE = 50;

/** A snap's start turn is shared by its regions, unlike their individual cycle numbers. */
export function snapConfidenceReset(
  completedStartTurn: number,
  previousResetStartTurn?: number
): { startTurn: number; value: number } | null {
  if (!Number.isSafeInteger(completedStartTurn) || completedStartTurn < 0) return null;
  if (
    previousResetStartTurn !== undefined &&
    (!Number.isSafeInteger(previousResetStartTurn) ||
      previousResetStartTurn < 0 ||
      previousResetStartTurn >= completedStartTurn)
  )
    return null;
  return { startTurn: completedStartTurn, value: POST_SNAP_CONFIDENCE };
}
