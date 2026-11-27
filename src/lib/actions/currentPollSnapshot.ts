import type { Db, ObjectId } from "mongodb";
import { charactersCollection } from "@/lib/db/repositories/characters";
export interface StoredPollSnapshot {
  takenAt: Date;
  overallAppeal: number;
  totalEstimatedVoters: number;
  totalPotentialVoters: number;
  granular?: unknown;
}
/** Retire only the observed legacy snapshot; a newer commissioned poll must survive. */
export async function currentPollSnapshot(
  db: Db,
  characterId: ObjectId,
  key: "lastPoll" | "lastPollLarge",
  snapshot: StoredPollSnapshot | undefined
): Promise<StoredPollSnapshot | undefined> {
  if (!snapshot || snapshot.granular) return snapshot;
  const cleared = await charactersCollection(db).updateOne(
    { _id: characterId, [key]: snapshot },
    { $unset: { [key]: "" } }
  );
  if (cleared.matchedCount) return undefined;
  const fresh = await charactersCollection(db).findOne(
    { _id: characterId },
    { projection: { [key]: 1 } }
  );
  const current = fresh?.[key] as StoredPollSnapshot | undefined;
  return current?.granular ? current : undefined;
}
