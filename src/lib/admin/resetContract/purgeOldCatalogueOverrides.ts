import type { Db } from "mongodb";
import { oldCatalogueIdsWithin } from "@/lib/admin/resetContract/rules/oldCatalogueIds";
import { electoratePriorityOverridesCollection } from "@/lib/db/repositories/electoratePriorityOverrides";

/**
 * Admin electorate priorities survive a reset, but a saved request that names a
 * retired-catalogue law type cannot exist in the one law book. Remove those so
 * the region falls back to the authored default; priorities on new-book laws
 * stay. Saved worlds that are never reset keep the old ids and their
 * compatibility tables.
 */
export async function purgeOldCatalogueOverrides(db: Db): Promise<number> {
  const collection = electoratePriorityOverridesCollection(db);
  const rows = await collection.find({}, { projection: { _id: 1, priorities: 1 } }).toArray();
  const stale = rows
    .filter((row) => oldCatalogueIdsWithin(row.priorities).length > 0)
    .map((row) => row._id);
  if (stale.length === 0) return 0;
  const result = await collection.deleteMany({ _id: { $in: stale } });
  return result.deletedCount ?? 0;
}
