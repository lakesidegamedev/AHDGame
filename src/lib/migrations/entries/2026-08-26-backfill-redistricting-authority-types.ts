import type { Db } from "mongodb";
import type { LegislationType } from "@/lib/db/types";
import type { Migration, MigrationResult } from "../types";
import { legislationTypes } from "@/lib/seeds/reference/legislationTypes";
import { POLITICAL_LEGISLATION_RETAINED_OLD_IDS } from "@/lib/politicalMetrics/pipelinePreset";
import { legislationTypesCollection } from "@/lib/db/repositories/legislationTypes";

/**
 * Give a live world the three state redistricting laws back.
 *
 * `legislationTypes` docs are written only by the world seeder, which never
 * re-runs on a live world. When the old US catalog was superseded, seeders began
 * excluding it by `countryScope` and these three went with it, with no
 * replacement: a new-generation `PoliticalLaw` is a five-level program, and these
 * are three-option mechanical switches.
 *
 * `src/lib/redistricting/caps.ts` still reads them BY ID out of `statePolicies`.
 * With no doc to propose against, `readOptionIndex` fell to its index-1 default
 * (bipartisan commission, `canDraw: false`) for every state, permanently.
 *
 * The set comes from the same constant the seeders filter on, so backfill and a
 * fresh seed cannot disagree. Inserts MISSING ids only via `$setOnInsert`,
 * leaving existing docs (and any admin edits) untouched.
 *
 * Behaviourally inert: it adds a proposable bill, it does not enact anything.
 * States keep their current default authority until a legislature passes one.
 *
 * The retained set is read at run time, but a migration runs once. A FOURTH id
 * would need its own migration. Operators: `GET /api/game/legislation-types`
 * caches for up to five minutes, so new laws can take that long to appear.
 */
async function backfillRedistrictingAuthorityTypes(
  db: Db,
  dryRun: boolean
): Promise<MigrationResult> {
  const notes: string[] = [];
  const wanted = legislationTypes.filter((lt) =>
    POLITICAL_LEGISLATION_RETAINED_OLD_IDS.has(lt._id)
  );

  const collection = legislationTypesCollection(db);
  const existing = await collection
    .find({ _id: { $in: wanted.map((t) => t._id) } }, { projection: { _id: 1 } })
    .toArray();
  const existingIds = new Set(existing.map((d) => String(d._id)));
  const missing = wanted.filter((t) => !existingIds.has(String(t._id)));

  notes.push(`${wanted.length} retained types; ${missing.length} missing.`);

  if (missing.length === 0) {
    notes.push("Nothing to insert.");
    return { documentsScanned: wanted.length, documentsInserted: 0, notes };
  }

  notes.push(`Inserting: ${missing.map((t) => t._id).join(", ")}`);
  if (dryRun) {
    notes.push("Dry run: no writes performed.");
    return { documentsScanned: wanted.length, documentsInserted: 0, notes };
  }

  // `_id` is deliberately kept OUT of `$setOnInsert`: the upsert filter already
  // supplies it, and naming an immutable field inside an update operator is a
  // needless way to have the server reject the write.
  await collection.bulkWrite(
    missing.map(({ _id, ...fields }) => ({
      updateOne: {
        filter: { _id },
        update: { $setOnInsert: fields as Partial<LegislationType> },
        upsert: true,
      },
    }))
  );

  return { documentsScanned: wanted.length, documentsInserted: missing.length, notes };
}

export const migration: Migration = {
  id: "2026-08-26-backfill-redistricting-authority-types",
  description:
    "Ticket #1189: insert the three state redistricting laws (authority / compactness / fairness) that stopped seeding when the old US catalog was superseded, so states can legislate who draws their map again.",
  // Inserts missing _ids only via $setOnInsert; a second pass finds nothing.
  idempotent: true,
  execute: (db, ctx) => backfillRedistrictingAuthorityTypes(db, ctx.dryRun),
};
