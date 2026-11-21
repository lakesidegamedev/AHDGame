import { useGameClock } from "@/contexts/useGameClock";
import { useCountdown } from "@/hooks/useCountdown";

export interface DeadlineLabel {
  text: string;
  /** Legacy wall-clock deadline has passed (only ever true without a closing turn). */
  expired: boolean;
  /** The closing turn has arrived and the engine has not tallied the vote yet. */
  pending: boolean;
  turnLabel?: string;
}

/**
 * Deadline label for bill stages. The engine closes a stage on its stored turn
 * number, so when one exists the label follows turns and never reads "Expired"
 * on a vote the engine has not closed. Wall-clock countdown is kept only for
 * legacy bills without a closing turn.
 */
export function useDeadlineLabel(
  deadline: string | null | undefined,
  deadlineTurn?: number | null,
  kind: "vote" | "presidentialAction" = "vote"
): DeadlineLabel {
  const clock = useGameClock();
  const hasTurn = Number.isSafeInteger(deadlineTurn) && deadlineTurn! >= 0;
  const legacy = useCountdown(hasTurn ? null : (deadline ?? null));
  const isPresidentialAction = kind === "presidentialAction";
  if (!hasTurn) {
    const expired = legacy === "Expired";
    const text =
      isPresidentialAction && legacy
        ? expired
          ? "Awaiting automatic enactment"
          : `Time to sign or veto · ${legacy}`
        : legacy;
    return { text, expired, pending: false };
  }

  const turnLabel = isPresidentialAction
    ? `Sign or veto by Turn ${deadlineTurn}`
    : `Voting closes turn ${deadlineTurn}`;
  const pending = clock.currentTurn > 0 && clock.currentTurn >= deadlineTurn!;
  if (pending) {
    return {
      text: isPresidentialAction ? "Awaiting automatic enactment" : "Awaiting result",
      expired: false,
      pending,
      turnLabel,
    };
  }

  const remaining = clock.currentTurn > 0 ? clock.formatRemainingTurns(deadlineTurn).text : null;
  const text = remaining
    ? isPresidentialAction
      ? `${turnLabel} · ${remaining}`
      : remaining
    : turnLabel;
  return { text, expired: false, pending, turnLabel };
}
