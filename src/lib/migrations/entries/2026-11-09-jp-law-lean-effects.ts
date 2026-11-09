import { isDeepStrictEqual } from "node:util";
import type { Db } from "mongodb";
import type { LegislationType } from "@/lib/db/types";
import { jpLegislationTypes } from "@/lib/countries/jp/data/jpLegislationTypes";
import type { Migration, MigrationResult } from "../types";

/**
 * Give a live world the lean effects authored on the Japanese law types.
 * `legislationTypes` docs are written only by the world seeder, which never
 * re-runs on a live world, so without this passed JP laws move no regional lean.
 *
 * Sets `demographicEffects` on EXISTING jp_* docs only (no upsert) from the seed;
 * docs that already match are skipped, so a second pass writes nothing.
 */
async function jpLawLeanEffects(db: Db, dryRun: boolean): Promise<MigrationResult> {
  const collection = db.collection<LegislationType>("legislationTypes");
  const seeded = jpLegislationTypes.filter((t) => t._id.startsWith("jp_") && t.demographicEffects);
  const existing = await collection
    .find({ _id: { $in: seeded.map((t) => t._id) } }, { projection: { demographicEffects: 1 } })
    .toArray();
  const current = new Map(existing.map((d) => [String(d._id), d.demographicEffects]));
  const stale = seeded.filter(
    (t) => current.has(t._id) && !isDeepStrictEqual(current.get(t._id), t.demographicEffects)
  );
  const notes = [`${seeded.length} seeded JP types; ${stale.length} to update.`];
  if (dryRun || stale.length === 0) {
    if (dryRun) notes.push("Dry run: no writes performed.");
    return { documentsScanned: existing.length, documentsUpdated: 0, notes };
  }
  await collection.bulkWrite(
    stale.map((t) => ({
      updateOne: {
        filter: { _id: t._id },
        update: { $set: { demographicEffects: t.demographicEffects } },
      },
    })),
    { ordered: false }
  );
  return { documentsScanned: existing.length, documentsUpdated: stale.length, notes };
}

export const migration: Migration = {
  id: "2026-11-09-jp-law-lean-effects",
  description:
    "Set lean effects on existing Japanese law types so passed JP laws move regional economic and social lean.",
  // $set of seed-derived values on existing _ids; docs already equal are skipped.
  idempotent: true,
  execute: (db, ctx) => jpLawLeanEffects(db, ctx.dryRun),
};
