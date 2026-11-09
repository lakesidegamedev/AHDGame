import { useGameClock } from "@/contexts/useGameClock";
import { useCountdown } from "@/hooks/useCountdown";

export interface DeadlineLabel {
  text: string;
  /** Legacy wall-clock deadline has passed (only ever true without a closing turn). */
  expired: boolean;
  /** The closing turn has arrived and the engine has not tallied the vote yet. */
  pending: boolean;
}

/**
 * Deadline label for bill votes. The engine closes a vote on its stored turn
 * number, so when one exists the label follows turns and never reads "Expired"
 * on a vote the engine has not closed. Wall-clock countdown is kept only for
 * legacy bills without a closing turn.
 */
export function useDeadlineLabel(
  deadline: string | null | undefined,
  deadlineTurn?: number | null
): DeadlineLabel {
  const clock = useGameClock();
  const hasTurn = Number.isSafeInteger(deadlineTurn) && deadlineTurn! >= 0;
  const legacy = useCountdown(hasTurn ? null : (deadline ?? null));
  if (!hasTurn) return { text: legacy, expired: legacy === "Expired", pending: false };
  const pending = clock.currentTurn > 0 && clock.currentTurn >= deadlineTurn!;
  const text = pending
    ? "Awaiting result"
    : clock.currentTurn > 0
      ? clock.formatRemainingTurns(deadlineTurn).text
      : `Voting closes turn ${deadlineTurn}`;
  return { text, expired: false, pending };
}
