"use client";

import { useGameClock } from "@/contexts/useGameClock";
import { useCountdown } from "@/hooks/useCountdown";

export function NominationVotingDeadline({
  votingEndsAt,
  votingEndsOnTurn,
}: {
  votingEndsAt: string | null;
  votingEndsOnTurn?: number | null;
}) {
  const clock = useGameClock();
  const hasTurn = Number.isSafeInteger(votingEndsOnTurn) && votingEndsOnTurn! >= 0;
  const legacyCountdown = useCountdown(hasTurn ? null : votingEndsAt);
  if (!hasTurn && !votingEndsAt) return null;
  const pending = hasTurn && clock.currentTurn >= votingEndsOnTurn!;
  const label = hasTurn
    ? pending
      ? "Awaiting result"
      : clock.currentTurn > 0
        ? clock.formatRemainingTurns(votingEndsOnTurn).text
        : `Voting closes turn ${votingEndsOnTurn}`
    : legacyCountdown;
  return (
    <span
      className={`text-xs tabular-nums font-mono ${!hasTurn && legacyCountdown === "Expired" ? "text-error" : pending ? "text-muted" : "text-yellow-400"}`}
      title={hasTurn ? `Voting closes turn ${votingEndsOnTurn}` : undefined}
    >
      ⏱ {label}
    </span>
  );
}
