import type { Db } from "mongodb";
import { getGameStateCollection } from "@/lib/db/collections";
import type { GameState } from "@/lib/db/types";

/** Pass `db` when already connected to avoid an extra collection-resolution round trip. */
export async function getGameState(db?: Db): Promise<GameState | null> {
  const collection = await getGameStateCollection(db);
  return collection.findOne({ _id: "current" });
}

/** The three world-level scalars nearly every page needs, without the rest of the document. */
export type GameStateCore = Pick<GameState, "_id" | "currentTurn" | "currentYear" | "preset">;

/**
 * Projected read of the fields a page needs to render its clock/preset.
 *
 * The current `gameState` document is tens of kilobytes (turn-phase map, audit
 * metadata, census deltas). Callers that only want the turn, the year or the
 * preset were deserialising all of it — pages like the central bank read it
 * three times per view. Use this instead of `getGameState()` unless you
 * genuinely need arbitrary fields.
 */
export async function getGameStateCore(db?: Db): Promise<GameStateCore | null> {
  const collection = await getGameStateCollection(db);
  return collection.findOne(
    { _id: "current" },
    { projection: { _id: 1, currentTurn: 1, currentYear: 1, preset: 1 } }
  );
}

/** Compatibility no-op while callers still expect an explicit invalidation hook. */
export function invalidateGameStateCache(): void {
  // GameState reads are intentionally uncached to preserve immediate visibility after writes.
}
