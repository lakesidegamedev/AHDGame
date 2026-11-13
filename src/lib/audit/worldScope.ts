import { ObjectId, type Db, type Document } from "mongodb";
import { gameStateCollection } from "@/lib/db/repositories/gameState";

const OBJECT_ID_HEX = /^[0-9a-f]{24}$/i;

/** The moment a world began: the creation time embedded in its epoch id. */
export function worldStartOf(worldEpochId: string | null | undefined): Date | null {
  if (!worldEpochId || !OBJECT_ID_HEX.test(worldEpochId)) return null;
  return new Date(parseInt(worldEpochId.slice(0, 8), 16) * 1000);
}

/**
 * Mongo filter for rows that belong to the current world: stamped with its epoch id, or
 * unstamped and created at or after the world's start (judged by the `_id` timestamp, or
 * `createdAt` when `timeField` says so). Unstamped rows from before the start are the old
 * world. Returns an empty filter when no world is active, so nothing is excluded.
 */
export function currentWorldFilter(
  worldEpochId: string | null | undefined,
  timeField: "_id" | "createdAt" = "_id"
): Document {
  if (!worldEpochId) return {};
  const start = worldStartOf(worldEpochId);
  if (!start) return { worldEpochId };
  const startValue =
    timeField === "_id" ? ObjectId.createFromTime(Math.floor(start.getTime() / 1000)) : start;
  return {
    $or: [{ worldEpochId }, { worldEpochId: null, [timeField]: { $gte: startValue } }],
  };
}

/** AND a world scope onto an existing filter without disturbing its own `$or`. */
export function withCurrentWorld<T extends Document>(
  filter: T,
  worldEpochId: string | null | undefined,
  timeField: "_id" | "createdAt" = "_id"
): T | { $and: Document[] } {
  const scope = currentWorldFilter(worldEpochId, timeField);
  if (Object.keys(scope).length === 0) return filter;
  return { $and: [filter, scope] };
}

export async function loadCurrentWorldEpochId(db: Db): Promise<string | null> {
  const state = await gameStateCollection(db).findOne(
    { _id: "current" },
    { projection: { worldEpochId: 1 } }
  );
  return state?.worldEpochId ?? null;
}
