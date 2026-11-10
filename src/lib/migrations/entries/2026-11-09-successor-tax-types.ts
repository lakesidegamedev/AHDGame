import type { Db } from "mongodb";
import type { LegislationType } from "@/lib/db/types";
import type { Migration, MigrationResult } from "../types";
import { successorTaxTypes } from "@/lib/resetLegislation/successorTaxTypes";

/** Add missing tax definitions without changing any live rate or policy. */
async function backfillSuccessorTaxTypes(db: Db, dryRun: boolean): Promise<MigrationResult> {
  const notes: string[] = [];
  const collection = db.collection<LegislationType>("legislationTypes");
  const existing = await collection
    .find({ _id: { $in: successorTaxTypes.map((t) => t._id) } }, { projection: { _id: 1 } })
    .toArray();
  const existingIds = new Set(existing.map((d) => String(d._id)));
  const missing = successorTaxTypes.filter((t) => !existingIds.has(String(t._id)));
  notes.push(`${successorTaxTypes.length} successor tax instruments; ${missing.length} missing.`);
  if (missing.length === 0 || dryRun) {
    if (dryRun) notes.push("Dry run: no writes performed.");
    return {
      documentsScanned: successorTaxTypes.length,
      documentsInserted: 0,
      notes,
    };
  }
  await collection.bulkWrite(
    missing.map(({ _id, ...fields }) => ({
      updateOne: {
        filter: { _id },
        update: { $setOnInsert: fields as Partial<LegislationType> },
        upsert: true,
      },
    })),
    { ordered: false }
  );
  return {
    documentsScanned: successorTaxTypes.length,
    documentsInserted: missing.length,
    notes,
  };
}

export const migration: Migration = {
  id: "2026-11-09-successor-tax-types",
  description: "Add independent Scottish and Welsh national tax instruments.",
  // Inserts missing _ids only via $setOnInsert; a second pass finds nothing.
  idempotent: true,
  execute: (db, ctx) => backfillSuccessorTaxTypes(db, ctx.dryRun),
};
