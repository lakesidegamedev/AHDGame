import { getGameState } from "@/lib/gameState";
import { getDb } from "@/lib/mongodb";
import { errorResponse } from "@/lib/api/errors";
import { isTurnProcessingNow } from "@/lib/turn/processingLock";

/**
 * Plant-changing actions wait while a turn is processing. A funded turn reads
 * every plant's capacity and build queue when it starts and settles against the
 * same image; a build, cancel, conversion or abandonment landing in between
 * stops the turn, so the request is refused for the turn's short window.
 */
export async function rejectWhileTurnProcessing(): Promise<Response | null> {
  const gameState = await getGameState(await getDb());
  if (gameState && isTurnProcessingNow(gameState))
    return errorResponse(409, "The game is processing this turn. Try again in a minute.");
  return null;
}
