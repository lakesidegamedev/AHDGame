/**
 * Bucket Approval Decay
 *
 * Decays every character and NPP per-bucket approval modifier ("dim:bucket"
 * keys) by 0.5% per turn toward 0, so approval effects fade over time and need
 * ongoing action to maintain. About 21% decay per game year (48 turns).
 */

import { decayApprovals } from "@/lib/legislature/rules/approvalDecay";
import { getDb } from "@/lib/mongodb";
import { getCharactersCollection } from "@/lib/db/collections/characters";
import { getNppsCollection } from "@/lib/db/collections/npps";

/**
 * Process bucket approval decay for all characters and NPPs.
 * Called once per turn during turn processing.
 *
 * @returns Summary of characters and NPPs processed
 */
export async function processBucketApprovalDecay(): Promise<{
  charactersProcessed: number;
  nppsProcessed: number;
}> {
  const db = await getDb();

  // Process characters with bucket approvals
  const characters = await (
    await getCharactersCollection(db)
  )
    .find({ bucketApprovals: { $exists: true, $ne: {} } }, { projection: { bucketApprovals: 1 } })
    .toArray();

  const charOps: {
    updateOne: {
      filter: {
        _id: (typeof characters)[number]["_id"];
        bucketApprovals: Record<string, number>;
      };
      update: { $set: { bucketApprovals: Record<string, number> } };
    };
  }[] = [];
  for (const character of characters) {
    const decayed = decayApprovals(character.bucketApprovals);
    if (decayed) {
      charOps.push({
        updateOne: {
          // Compare the snapshot so an API credit arriving during decay is never lost.
          filter: { _id: character._id, bucketApprovals: character.bucketApprovals! },
          update: { $set: { bucketApprovals: decayed } },
        },
      });
    }
  }
  const charactersProcessed =
    charOps.length > 0
      ? (await (await getCharactersCollection(db)).bulkWrite(charOps)).modifiedCount
      : 0;

  // Process NPPs with bucket approvals
  const npps = await (
    await getNppsCollection(db)
  )
    // Read only the approval balances and Mongo's default _id projection.
    .find(
      { bucketApprovals: { $exists: true, $ne: {} }, retiredAt: null },
      { projection: { bucketApprovals: 1 } }
    )
    .toArray();

  const nppOps: {
    updateOne: {
      filter: { _id: (typeof npps)[number]["_id"]; bucketApprovals: Record<string, number> };
      update: { $set: { bucketApprovals: Record<string, number> } };
    };
  }[] = [];
  for (const npp of npps) {
    const decayed = decayApprovals(npp.bucketApprovals);
    if (decayed) {
      nppOps.push({
        updateOne: {
          filter: { _id: npp._id, bucketApprovals: npp.bucketApprovals! },
          update: { $set: { bucketApprovals: decayed } },
        },
      });
    }
  }
  const nppsProcessed =
    nppOps.length > 0 ? (await (await getNppsCollection(db)).bulkWrite(nppOps)).modifiedCount : 0;

  return { charactersProcessed, nppsProcessed };
}
