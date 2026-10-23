import type { CreateIndexesOptions, Db, IndexSpecification } from "mongodb";
import type { MigrationResult } from "./types";

export type IndexPlan = {
  collection: string;
  keys: IndexSpecification;
  options: CreateIndexesOptions & { name: string };
};

/** Execute an entry-owned index plan sequentially, preserving migration reporting. */
export async function createPlannedIndexes(
  db: Db,
  dryRun: boolean,
  plans: readonly IndexPlan[]
): Promise<MigrationResult> {
  const notes: string[] = [];

  for (const plan of plans) {
    const label = `${plan.collection}.${plan.options.name}`;
    if (dryRun) {
      notes.push(`would create ${label}`);
      continue;
    }

    await db.collection(plan.collection).createIndex(plan.keys, plan.options);
    notes.push(`created/verified ${label}`);
  }

  return {
    documentsScanned: plans.length,
    documentsUpdated: dryRun ? 0 : plans.length,
    notes,
  };
}
