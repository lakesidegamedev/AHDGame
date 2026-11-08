import { getDb } from "@/lib/mongodb";
import type { GameState } from "@/lib/db/types";

export async function isAutoDisastersEnabled(preloadedGameState?: {
  autoDisastersEnabled?: boolean;
}): Promise<boolean> {
  if (preloadedGameState !== undefined) {
    return preloadedGameState.autoDisastersEnabled === true;
  }
  const db = await getDb();
  const gs = await db.collection<GameState>("gameState").findOne({ _id: "current" });
  return gs?.autoDisastersEnabled === true;
}
