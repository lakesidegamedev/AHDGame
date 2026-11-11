import type { Db } from "mongodb";
import type { ElectoratePriorityOverride } from "@/lib/db/types/electoratePriorityOverride";
import {
  migratePrioritySelection,
  type PrioritySelectionLike,
} from "@/lib/legislation/oldBookMapping";
import type { Migration, MigrationResult } from "../types";

/**
 * Admin-saved electorate priorities for the US and UK named retired law types.
 * Point each one at the closest law and level in the one law book. A saved
 * request that cannot be mapped, or that would name one law twice, is removed;
 * region pages already ignore such a request and show the authored default.
 */
async function repointPriorityOverrides(db: Db, dryRun: boolean): Promise<MigrationResult> {
  const collection = db.collection<ElectoratePriorityOverride>("electoratePriorityOverrides");
  const rows = await collection
    .find({ countryId: { $in: ["US", "UK"] } }, { projection: { _id: 1, priorities: 1 } })
    .toArray();

  const updates: { _id: string; priorities: PrioritySelectionLike }[] = [];
  const removals: string[] = [];
  for (const row of rows) {
    const result = migratePrioritySelection(row.priorities as PrioritySelectionLike);
    if (result.kind === "migrated") updates.push({ _id: row._id, priorities: result.selection });
    if (result.kind === "unusable") removals.push(row._id);
  }

  const notes = [
    `${rows.length} US and UK saved priorities; ${updates.length} to re-point, ${removals.length} unusable`,
  ];
  if (dryRun || (updates.length === 0 && removals.length === 0)) {
    if (dryRun) notes.push("Dry run: no writes performed.");
    return { documentsScanned: rows.length, documentsUpdated: 0, documentsDeleted: 0, notes };
  }
  if (updates.length > 0) {
    await collection.bulkWrite(
      updates.map((u) => ({
        updateOne: {
          filter: { _id: u._id },
          update: {
            $set: { priorities: u.priorities as ElectoratePriorityOverride["priorities"] },
          },
        },
      }))
    );
  }
  if (removals.length > 0) await collection.deleteMany({ _id: { $in: removals } });
  return {
    documentsScanned: rows.length,
    documentsUpdated: updates.length,
    documentsDeleted: removals.length,
    notes,
  };
}

export const migration: Migration = {
  id: "2026-11-11-electorate-priority-law-book",
  description:
    "Re-point admin-saved US and UK electorate legislative priorities from the retired law types to the one law book; remove saved priorities that cannot be mapped.",
  // Already-migrated selections come back unchanged, so a second pass writes nothing.
  idempotent: true,
  execute: (db, ctx) => repointPriorityOverrides(db, ctx.dryRun),
};
