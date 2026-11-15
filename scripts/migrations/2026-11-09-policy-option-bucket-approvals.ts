/**
 * Moves `legislationTypes.policyOptions[].archetypeApprovals` to
 * `bucketApprovals` (keys are already "dim:bucket") and drops `groupApprovals`.
 *
 * An option that already has `bucketApprovals` keeps it: the legacy map is
 * merged underneath, so the new build's keys win. Dry run unless `--apply` is
 * passed.
 */
import type { Db } from "mongodb";
import { connectDb, closeDb } from "../utils/db";

export const LEGACY_OPTION_FILTER = {
  $or: [
    { "policyOptions.archetypeApprovals": { $exists: true } },
    { "policyOptions.groupApprovals": { $exists: true } },
  ],
};

export const OPTION_MIGRATION_PIPELINE = [
  {
    $set: {
      policyOptions: {
        $map: {
          input: "$policyOptions",
          as: "option",
          in: {
            $let: {
              vars: { legacy: { $ifNull: ["$$option.archetypeApprovals", null] } },
              in: {
                $mergeObjects: [
                  {
                    $arrayToObject: {
                      $filter: {
                        input: { $objectToArray: "$$option" },
                        cond: {
                          $not: [{ $in: ["$$this.k", ["archetypeApprovals", "groupApprovals"]] }],
                        },
                      },
                    },
                  },
                  {
                    $cond: [
                      { $eq: ["$$legacy", null] },
                      {},
                      {
                        // Legacy keys first, the option's own bucketApprovals last so it wins.
                        bucketApprovals: {
                          $mergeObjects: [
                            "$$legacy",
                            { $ifNull: ["$$option.bucketApprovals", {}] },
                          ],
                        },
                      },
                    ],
                  },
                ],
              },
            },
          },
        },
      },
    },
  },
];

export async function migratePolicyOptionBucketApprovals(
  db: Db,
  apply: boolean
): Promise<{ affected: number; modified: number }> {
  const types = db.collection("legislationTypes");
  const affected = await types.countDocuments(LEGACY_OPTION_FILTER);
  console.log(`legislationTypes with legacy option approvals: ${affected}`);
  if (!apply) return { affected, modified: 0 };
  const result = await types.updateMany(LEGACY_OPTION_FILTER, OPTION_MIGRATION_PIPELINE);
  console.log(`Migrated ${result.modifiedCount} documents.`);
  return { affected, modified: result.modifiedCount };
}

async function main() {
  const apply = process.argv.includes("--apply");
  const db = await connectDb();
  await migratePolicyOptionBucketApprovals(db, apply);
  if (!apply) console.log("Dry run. Re-run with --apply to migrate.");
}

if (process.argv[1]?.endsWith("policy-option-bucket-approvals.ts")) {
  main()
    .catch((err) => {
      console.error(err);
      process.exitCode = 1;
    })
    .finally(() => closeDb());
}
