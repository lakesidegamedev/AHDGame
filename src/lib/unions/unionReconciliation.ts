import type { Db, ObjectId } from "mongodb";
import type { Character, Union } from "@/lib/db/types";
import { charactersCollection } from "@/lib/db/repositories/characters";
import { unionsCollection } from "@/lib/db/repositories/unions";

/**
 * Self-heal helpers for the `Character.unionLeaderOf` cache, the denormalized
 * mirror of `Union.ownerId` (source of truth). Desyncs (e.g. a crash between
 * `claimUnion`'s two writes) would otherwise persist and can lock a character
 * out of reclaiming, since `claimUnion` 409s when the cache is non-null.
 * Called from read paths that already load `union`/`character`.
 */

/**
 * If `union.ownerId` is set but that character's `unionLeaderOf` cache
 * doesn't point back at this union, correct it. Fire-and-forget from the
 * caller's perspective is fine (best-effort self-heal), but this function
 * itself awaits the write so tests can assert on it deterministically.
 */
export async function reconcileUnionOwnerCache(
  db: Db,
  union: Pick<Union, "_id" | "ownerId">
): Promise<void> {
  if (!union.ownerId) return;
  const owner = await charactersCollection(db).findOne(
    { _id: union.ownerId },
    { projection: { unionLeaderOf: 1 } }
  );
  if (!owner) return;
  if (owner.unionLeaderOf && owner.unionLeaderOf.toString() === union._id.toString()) return;
  await charactersCollection(db).updateOne(
    { _id: union.ownerId },
    { $set: { unionLeaderOf: union._id, updatedAt: new Date() } }
  );
}

/**
 * If `character.unionLeaderOf` is set but that union's `ownerId` doesn't
 * match this character, clear the stale cache. This un-sticks a character
 * who would otherwise be permanently blocked from ever claiming a union
 * again (mitigates part of code-review fix #5).
 *
 * Returns the AUTHORITATIVE `unionLeaderOf` value after reconciliation
 * (`null` if just cleared) — callers that already loaded the character's
 * in-memory `unionLeaderOf` should use this return value instead, since the
 * in-memory object won't reflect a correction just made to the DB.
 */
export async function reconcileUnionLeaderCache(
  db: Db,
  character: Pick<Character, "_id" | "unionLeaderOf">
): Promise<ObjectId | null> {
  if (!character.unionLeaderOf) return null;
  const union = await unionsCollection(db)
    .findOne({ _id: character.unionLeaderOf }, { projection: { ownerId: 1 } });
  const matches = union?.ownerId && union.ownerId.toString() === character._id.toString();
  if (matches) return character.unionLeaderOf;
  await charactersCollection(db).updateOne(
    { _id: character._id },
    { $set: { unionLeaderOf: null, updatedAt: new Date() } }
  );
  return null;
}
