/**
 * Moves `archetypeApprovals` to `bucketApprovals` on characters and NPPs. Keys
 * are already "dim:bucket", so the values carry over unchanged.
 *
 * Safe to run after the new build has written `bucketApprovals`: a document
 * with no `bucketApprovals` is renamed, and a document that already has one is
 * merged with the keys the new build wrote winning, so nothing accrued since
 * deploy is lost. Dry run unless `--apply` is passed.
 */
import type { Db } from "mongodb";
import { connectDb, closeDb } from "../utils/db";

const COLLECTIONS = ["characters", "npps"] as const;

export const RENAME_FILTER = {
  archetypeApprovals: { $exists: true },
  bucketApprovals: { $exists: false },
};
export const MERGE_FILTER = {
  archetypeApprovals: { $exists: true },
  bucketApprovals: { $exists: true },
};
/** Legacy keys first, existing `bucketApprovals` last so the new build's values win. */
export const MERGE_PIPELINE = [
  {
    $set: {
      bucketApprovals: {
        $mergeObjects: [
          { $ifNull: ["$archetypeApprovals", {}] },
          { $ifNull: ["$bucketApprovals", {}] },
        ],
      },
    },
  },
  { $unset: "archetypeApprovals" },
];

export async function migrateBucketApprovals(
  db: Db,
  apply: boolean
): Promise<Record<string, { renamed: number; merged: number }>> {
  const summary: Record<string, { renamed: number; merged: number }> = {};
  for (const name of COLLECTIONS) {
    const col = db.collection(name);
    const [toRename, toMerge] = await Promise.all([
      col.countDocuments(RENAME_FILTER),
      col.countDocuments(MERGE_FILTER),
    ]);
    console.log(
      `${name}: ${toRename} to rename, ${toMerge} to merge into existing bucketApprovals`
    );
    summary[name] = { renamed: 0, merged: 0 };
    if (!apply) continue;
    if (toRename > 0) {
      const renamed = await col.updateMany(RENAME_FILTER, {
        $rename: { archetypeApprovals: "bucketApprovals" },
      });
      summary[name].renamed = renamed.modifiedCount;
    }
    if (toMerge > 0) {
      const merged = await col.updateMany(MERGE_FILTER, MERGE_PIPELINE);
      summary[name].merged = merged.modifiedCount;
    }
    console.log(`${name}: renamed ${summary[name].renamed}, merged ${summary[name].merged}`);
  }
  return summary;
}

async function main() {
  const apply = process.argv.includes("--apply");
  const db = await connectDb();
  await migrateBucketApprovals(db, apply);
  if (!apply) console.log("Dry run. Re-run with --apply to migrate.");
}

if (process.argv[1]?.endsWith("character-npp-bucket-approvals.ts")) {
  main()
    .catch((err) => {
      console.error(err);
      process.exitCode = 1;
    })
    .finally(() => closeDb());
}
