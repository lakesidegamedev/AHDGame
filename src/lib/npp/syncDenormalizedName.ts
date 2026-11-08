import type { Db, ObjectId } from "mongodb";

/**
 * Collections that denormalize an NPP's display name beside `nppId`.
 * Keep this list in sync with any new write path that copies `npp.name`.
 * Skipping one leaves stale names visible in polls and search.
 */
export async function syncDenormalizedNppName(
  db: Db,
  nppId: ObjectId,
  newName: string
): Promise<{ candidaciesUpdated: number; officialsUpdated: number }> {
  const [candidacies, officials] = await Promise.all([
    db.collection("electionCandidates").updateMany({ nppId }, { $set: { characterName: newName } }),
    db.collection("electedOfficials").updateMany({ nppId }, { $set: { characterName: newName } }),
  ]);

  return {
    candidaciesUpdated: candidacies.modifiedCount,
    officialsUpdated: officials.modifiedCount,
  };
}
