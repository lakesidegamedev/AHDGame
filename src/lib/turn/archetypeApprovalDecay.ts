/**
 * Archetype Approval Decay
 *
 * Decays all character and NPP archetype approvals by 0.5% per turn toward 0.
 * This creates a natural half-life where approval effects fade over time,
 * requiring ongoing action to maintain relationships with voter archetypes.
 *
 * Decay rate: 0.5% per turn = ~21% decay per game year (48 turns)
 */

import { decayApprovals } from "@/lib/legislature/rules/approvalDecay";
import { getDb } from "@/lib/mongodb";
import type { Character, NPP } from "@/lib/db/types";

/**
 * Process archetype approval decay for all characters and NPPs.
 * Called once per turn during turn processing.
 *
 * @returns Summary of characters and NPPs processed
 */
export async function processArchetypeApprovalDecay(): Promise<{
  charactersProcessed: number;
  nppsProcessed: number;
}> {
  const db = await getDb();

  // Process characters with archetype approvals
  const characters = await db
    .collection<Character>("characters")
    .find(
      { archetypeApprovals: { $exists: true, $ne: {} } },
      { projection: { archetypeApprovals: 1 } }
    )
    .toArray();

  const charOps: {
    updateOne: {
      filter: {
        _id: (typeof characters)[number]["_id"];
        archetypeApprovals: Record<string, number>;
      };
      update: { $set: { archetypeApprovals: Record<string, number> } };
    };
  }[] = [];
  for (const character of characters) {
    const decayed = decayApprovals(character.archetypeApprovals);
    if (decayed) {
      charOps.push({
        updateOne: {
          // Compare the snapshot so an API credit arriving during decay is never lost.
          filter: { _id: character._id, archetypeApprovals: character.archetypeApprovals! },
          update: { $set: { archetypeApprovals: decayed } },
        },
      });
    }
  }
  const charactersProcessed =
    charOps.length > 0
      ? (await db.collection<Character>("characters").bulkWrite(charOps)).modifiedCount
      : 0;

  // Process NPPs with archetype approvals
  const npps = await db
    .collection<NPP>("npps")
    // Read only the approval balances and Mongo's default _id projection.
    .find(
      { archetypeApprovals: { $exists: true, $ne: {} }, retiredAt: null },
      { projection: { archetypeApprovals: 1 } }
    )
    .toArray();

  const nppOps: {
    updateOne: {
      filter: { _id: (typeof npps)[number]["_id"]; archetypeApprovals: Record<string, number> };
      update: { $set: { archetypeApprovals: Record<string, number> } };
    };
  }[] = [];
  for (const npp of npps) {
    const decayed = decayApprovals(npp.archetypeApprovals);
    if (decayed) {
      nppOps.push({
        updateOne: {
          filter: { _id: npp._id, archetypeApprovals: npp.archetypeApprovals! },
          update: { $set: { archetypeApprovals: decayed } },
        },
      });
    }
  }
  const nppsProcessed =
    nppOps.length > 0 ? (await db.collection<NPP>("npps").bulkWrite(nppOps)).modifiedCount : 0;

  return { charactersProcessed, nppsProcessed };
}
