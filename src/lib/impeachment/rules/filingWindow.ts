import { IMPEACHMENT_POST_ELECTION_PROTECTION_TURNS } from "@/lib/constants/impeachment";

/** Election wins are supplied by the shell; re-election starts a fresh protection window. */
export function impeachmentFilingWindow(currentTurn: number, electionTurns: readonly number[]) {
  const valid = electionTurns.filter(
    (turn) => Number.isSafeInteger(turn) && turn >= 0 && turn <= currentTurn
  );
  const lastElectionTurn = valid.length ? Math.max(...valid) : null;
  const eligibleOnTurn =
    lastElectionTurn === null
      ? null
      : lastElectionTurn + IMPEACHMENT_POST_ELECTION_PROTECTION_TURNS;
  const remainingTurns = eligibleOnTurn === null ? 0 : Math.max(0, eligibleOnTurn - currentTurn);
  return { lastElectionTurn, eligibleOnTurn, remainingTurns };
}
