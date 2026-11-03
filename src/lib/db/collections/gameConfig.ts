import type { Db } from "mongodb";
import { getDb } from "@/lib/mongodb";
import type { GameConfig } from "../types";

/**
 * Typed `gameConfig` collection (singleton doc `_id: "default"`).
 * Pass `db` when already connected to avoid an extra `getDb()` await.
 */
export async function getGameConfigCollection(db?: Db) {
  const database = db ?? (await getDb());
  return database.collection<GameConfig>("gameConfig");
}
