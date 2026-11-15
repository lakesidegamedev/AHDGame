// A heal whose pinned rows belong to one world must not run in the next one.
//
// Restitution heals pin rows of an incident (turn numbers, corporation ids,
// a central bank balance). After a reset the same ids and turn numbers exist
// again in a fresh world, so a detector can find "owed" rows that the new
// world never owed. `worldsStartedBefore` scopes a defect to worlds whose
// epoch began before a date; in a later world it reports nothing to heal
// and refuses to plan or apply.

import { ObjectId, type Db } from "mongodb";
import type { Defect } from "./types";
import { gameStateCollection } from "@/lib/db/repositories/gameState";

/** Start of the current world, from `gameState.worldEpochId`, or null when unknown. */
export async function currentWorldStart(db: Db): Promise<Date | null> {
  const state = await gameStateCollection(db).findOne(
    { _id: "current" },
    { projection: { worldEpochId: 1 } }
  );
  const id = state?.worldEpochId;
  if (typeof id !== "string" || !ObjectId.isValid(id)) return null;
  return new ObjectId(id).getTimestamp();
}

/**
 * Why this defect does not apply to the current world, or null when it does.
 * A world with no recorded epoch counts as an old world (in scope).
 */
export async function worldOutOfScope(db: Db, defect: Defect): Promise<string | null> {
  if (!defect.worldsStartedBefore) return null;
  const cutoff = new Date(defect.worldsStartedBefore);
  if (Number.isNaN(cutoff.getTime())) {
    throw new Error(`[remediation] ${defect.id} has an invalid worldsStartedBefore`);
  }
  const started = await currentWorldStart(db);
  if (!started || started < cutoff) return null;
  return (
    `${defect.id} applies only to worlds started before ${cutoff.toISOString()}; ` +
    `the current world started ${started.toISOString()}`
  );
}
