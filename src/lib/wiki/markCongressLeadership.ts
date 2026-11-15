/**
 * Mark that a character has held Congress leadership.
 * Call when a character is placed into or wins a Congress leadership role.
 * Skips if the ID is an NPP (only characters get politician pages).
 */
import type { Db } from "mongodb";
import { ObjectId } from "mongodb";
import type { PoliticianOverride } from "@/lib/db/types";
import { charactersCollection } from "@/lib/db/repositories/characters";
import { politicianOverridesCollection } from "@/lib/db/repositories/politicianOverrides";

export async function markCongressLeadershipHeld(
  db: Db,
  assignedId: string,
  now: Date
): Promise<void> {
  const char = await charactersCollection(db).findOne({
    _id: new ObjectId(assignedId),
  });
  if (!char) return;

  const existing = await politicianOverridesCollection(db).findOne({
    politicianId: assignedId,
  });

  if (existing) {
    await politicianOverridesCollection(db).updateOne(
      { politicianId: assignedId },
      { $set: { hasHeldCongressLeadership: true, updatedAt: now } }
    );
  } else {
    await politicianOverridesCollection(db).insertOne({
      politicianId: assignedId,
      hasHeldCongressLeadership: true,
      updatedAt: now,
    } as PoliticianOverride);
  }
}
