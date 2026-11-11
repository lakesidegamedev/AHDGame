import type { Db } from "mongodb";
import type { GameState } from "@/lib/db/types";
import { gameStateCollection } from "@/lib/db/repositories/gameState";

/**
 * Read the current game turn from GameState.
 * Returns 0 if the document is missing — callers that need a live turn
 * (e.g. share-trade history audit) tolerate 0 without throwing.
 */
export async function getCurrentTurn(db: Db): Promise<number> {
  const gs = await gameStateCollection(db).findOne({ _id: "current" });
  return gs?.currentTurn ?? 0;
}
