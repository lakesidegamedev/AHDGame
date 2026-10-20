import type { Db } from "mongodb";
import type { LegislationType } from "@/lib/db/types";
import type { Migration, MigrationResult } from "../types";
import { mechanicalLegislationTypes } from "@/lib/mechanicalLaws/legislation";

/**
 * Give a live world the Competition, Subsidiary Limits and Foreign Investment
 * Acts. `legislationTypes` docs are written only by the world seeder, which
 * never re-runs on a live world, so without this the laws exist only after a
 * reset.
 *
 * Inserts MISSING ids only, via `$setOnInsert`; an existing doc is untouched.
 * Writes no `statePolicies`: until a bill passes, the reader returns each
 * law's authored starting level (mechanicalLaws/registry), so a live world and
 * a fresh seed agree without a policy backfill.
 *
 * Note for operators: `GET /api/game/legislation-types` caches its reads for
 * up to five minutes, so the new laws can take that long to appear in the bill
 * picker after this runs.
 */
async function backfillMechanicalLawTypes(db: Db, dryRun: boolean): Promise<MigrationResult> {
  const notes: string[] = [];
  const collection = db.collection<LegislationType>("legislationTypes");
  const existing = await collection
    .find(
      { _id: { $in: mechanicalLegislationTypes.map((t) => t._id) } },
      { projection: { _id: 1 } }
    )
    .toArray();
  const existingIds = new Set(existing.map((d) => String(d._id)));
  const missing = mechanicalLegislationTypes.filter((t) => !existingIds.has(String(t._id)));
  notes.push(
    `${mechanicalLegislationTypes.length} mechanical law types; ${missing.length} missing.`
  );
  if (missing.length === 0 || dryRun) {
    if (dryRun) notes.push("Dry run: no writes performed.");
    return {
      documentsScanned: mechanicalLegislationTypes.length,
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
    documentsScanned: mechanicalLegislationTypes.length,
    documentsInserted: missing.length,
    notes,
  };
}

export const migration: Migration = {
  id: "2026-10-21-backfill-mechanical-law-types",
  description:
    "Insert the Competition, Subsidiary Limits and Foreign Investment Acts for every legislature, so a live world can legislate them without a reset.",
  // Inserts missing _ids only via $setOnInsert; a second pass finds nothing.
  idempotent: true,
  execute: (db, ctx) => backfillMechanicalLawTypes(db, ctx.dryRun),
};
