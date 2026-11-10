import type { Db } from "mongodb";
import { logWarning } from "@/lib/utils/errorLog";
import type { LegislationType } from "@/lib/db/types";
import { legislationTypes } from "@/lib/seeds/reference/legislationTypes";
import { getProjectedPoliticalLegislationTypes } from "./seedPoliticalLegislation";
import { isOldLegislationTypeExcluded } from "@/lib/politicalMetrics/pipelinePreset";

export async function seedLegislationTypes(
  db: Db,
  reset: boolean,
  log: (msg: string) => void,
  _preset: string
) {
  if (reset) {
    await db
      .collection("committeeAssignments")
      .drop()
      .catch((error) => {
        logWarning("Collection drop failed (may not exist)", {
          component: "AdminSeed",
          action: "drop collection",
          metadata: { error: String(error) },
        });
      });
    await db.collection("stateBills").deleteMany({});
  }

  const collection = db.collection<LegislationType>("legislationTypes");

  const baseTypes = legislationTypes.filter((t) => !isOldLegislationTypeExcluded(t));
  // Every law is projected, windowed or not: a window gates filing at runtime,
  // so a later-era type must already exist when the world reaches its year.
  const projectedTypes = getProjectedPoliticalLegislationTypes();
  const seedSet = [...baseTypes, ...projectedTypes];

  // Upsert-by-_id instead of drop+insertMany so this is idempotent and
  // safe to run against a live world at any time: new reference entries
  // reach existing worlds without a destructive reseed, and pruning keeps
  // the collection in sync with the reference file.
  if (seedSet.length > 0) {
    await collection.bulkWrite(
      seedSet.map((t) => ({
        replaceOne: { filter: { _id: t._id }, replacement: t, upsert: true },
      }))
    );
  }
  // Never touch admin-authored custom types (source: "admin", created via
  // /api/admin/law-types) — the old drop()+insertMany already silently wiped
  // these on every reseed, which this fix should not carry forward.
  // The prune set is the CURRENT seed set, so the excluded old US/UK/RU/DD docs
  // are removed and the projected political-legislation docs survive.
  await collection.deleteMany({
    _id: { $nin: seedSet.map((t) => t._id) },
    source: { $ne: "admin" },
  });

  log(
    `Seeded ${seedSet.length} legislation types (synced, non-destructive` +
      `, ${projectedTypes.length} projected political laws)`
  );
}
