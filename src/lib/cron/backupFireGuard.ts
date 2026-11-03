import type { GameState } from "@/lib/db/types";
import { getLatestCompletedTurnRealTime } from "@/lib/turn/turnLogQueries";
import { resolveTurnCronMinute, turnHourBucket, type TurnCronMinute } from "./turnCronMinute";

/**
 * Determines whether the backup turn, half an hour after the scheduled turn, should fire.
 * In normal mode, the backup only fires if no turn completed in the current turn hour.
 * In fast mode, both :00 and :30 are legitimate turns, so this always returns true.
 */
export async function shouldFireBackupTurn(
  now: Date,
  gameState: GameState,
  minute: TurnCronMinute = resolveTurnCronMinute()
): Promise<boolean> {
  // The backup fire only suppresses itself in normal mode. In fast mode both :00 and
  // :30 are legitimate scheduled turns, so the backup proceeds unconditionally — same
  // as the primary.
  if (gameState.fastMode) {
    return true;
  }

  const latestCompletedTurnAt = await getLatestCompletedTurnRealTime(gameState);
  const alreadyRanThisHour =
    latestCompletedTurnAt &&
    turnHourBucket(latestCompletedTurnAt, minute) === turnHourBucket(now, minute);

  return !alreadyRanThisHour;
}
