import { getDb } from "@/lib/mongodb";
import type { GameState } from "@/lib/db/types";
import { gameStateCollection } from "@/lib/db/repositories/gameState";

/**
 * When false or absent, PREE skips new offers. Pending instances still sweep.
 */
export async function isPlayerRandomEventsEnabled(preloaded?: {
  playerRandomEventsEnabled?: boolean;
}): Promise<boolean> {
  if (preloaded !== undefined) {
    return preloaded.playerRandomEventsEnabled === true;
  }
  const db = await getDb();
  const gs = await gameStateCollection(db).findOne({ _id: "current" });
  return gs?.playerRandomEventsEnabled === true;
}
