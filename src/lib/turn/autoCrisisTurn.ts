import type { Db } from "mongodb";
import { processAutoCrisisSpawn } from "@/lib/crises/autoCrisisSpawn";

/**
 * Turn phase for the economic/political automatic crises (condition + random
 * tiers). Shares the pause switch with the regional disaster spawner.
 */
export async function processAutoCrisisTurn(
  db: Db,
  turn: number,
  preloadedGameState?: { autoCrisisPaused?: boolean; autoDisastersEnabled?: boolean }
): Promise<void> {
  // Emergency kill switch. The system ships on, so only an explicit false stops it.
  if (preloadedGameState?.autoDisastersEnabled === false) return;
  // Temporary pause: stay enabled but spawn nothing new this turn.
  if (preloadedGameState?.autoCrisisPaused === true) return;
  await processAutoCrisisSpawn(db, turn);
}
