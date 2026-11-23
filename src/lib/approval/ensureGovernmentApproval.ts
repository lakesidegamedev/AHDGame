import type { Db } from "mongodb";
import { governmentApprovalsCollection } from "@/lib/db/repositories/governmentApprovals";

/** Initialize before guarded effects so a missing snapshot cannot swallow a decision. */
export async function ensureGovernmentApproval(
  db: Db,
  countryIds: readonly string[]
): Promise<void> {
  const ids = [...new Set(countryIds)];
  if (ids.length === 0) return;
  await governmentApprovalsCollection<import("mongodb").Document & { _id: string }>(db).bulkWrite(
    ids.map((countryId) => ({
      updateOne: {
        filter: { _id: countryId },
        update: {
          $setOnInsert: {
            countryId,
            approvalRating: 50,
            approvalRawRating: 50,
            approvalAdjustment: 0,
            disapprovalRating: 50,
            netApproval: 0,
            source: "aggregate",
            history: [],
            activeNationalModifiers: [],
            activeRegionalModifiers: [],
            approvalBase: 50,
            stateAverage: 50,
            updatedAt: new Date(),
          },
        },
        upsert: true,
      },
    }))
  );
}
