/**
 * Migration: rename policy-option approvals to `bucketApprovals`.
 *
 * `legislationTypes.policyOptions[].archetypeApprovals` already holds
 * "dim:bucket" keys after the 2026-08-19 projection; this renames the field so
 * the stored shape matches the code. The deprecated `groupApprovals` field has
 * no readers and is dropped.
 *
 * Fresh worlds seed `bucketApprovals` directly; this only matters for existing
 * documents.
 *
 * Usage:
 *   npx tsx scripts/migrations/2026-11-09-policy-option-bucket-approvals.ts [--apply]
 * Defaults to a dry run that reports counts.
 */
import { connectDb, closeDb } from "../utils/db";

const apply = process.argv.includes("--apply");

async function main() {
  const db = await connectDb();
  const types = db.collection("legislationTypes");
  const filter = {
    $or: [
      { "policyOptions.archetypeApprovals": { $exists: true } },
      { "policyOptions.groupApprovals": { $exists: true } },
    ],
  };
  const affected = await types.countDocuments(filter);
  console.log(`legislationTypes with legacy option approvals: ${affected}`);
  if (!apply) {
    console.log("Dry run. Re-run with --apply to migrate.");
    return;
  }
  const result = await types.updateMany(filter, [
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
                    { $cond: [{ $eq: ["$$legacy", null] }, {}, { bucketApprovals: "$$legacy" }] },
                  ],
                },
              },
            },
          },
        },
      },
    },
  ]);
  console.log(`Migrated ${result.modifiedCount} documents.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => closeDb());
