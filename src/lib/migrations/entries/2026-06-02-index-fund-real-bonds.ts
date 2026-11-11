import type { Db } from "mongodb";
import type { IndexFund } from "@/lib/db/types";
import type { Migration, MigrationContext, MigrationResult } from "../types";
import { indexFundsCollection } from "@/lib/db/repositories/indexFunds";
import type { Document } from "mongodb";

/**
 * Drop synthetic bondAllocations ledger rows and restore that principal to
 * cashAnchor so the hourly fund cron can repurchase real sovereign bonds.
 */
async function migrateIndexFundsToRealBonds(
  db: Db,
  ctx: MigrationContext
): Promise<MigrationResult> {
  const funds = await indexFundsCollection(db)
    .find({ bondAllocations: { $exists: true, $ne: [] } })
    .toArray();

  if (ctx.dryRun) {
    return {
      notes: [`would migrate ${funds.length} funds off synthetic bondAllocations`],
      documentsScanned: funds.length,
      documentsUpdated: 0,
      documentsInserted: 0,
    };
  }

  let updated = 0;
  for (const fund of funds) {
    const syntheticPrincipal = (fund.bondAllocations ?? []).reduce(
      (sum, row) => sum + Math.max(0, row.principalAnchor ?? 0),
      0
    );
    if (syntheticPrincipal <= 0) {
      await indexFundsCollection<Document>(db)
        .updateOne(
          { _id: fund._id },
          { $unset: { bondAllocations: "" }, $set: { updatedAt: new Date() } }
        );
      updated++;
      continue;
    }

    await indexFundsCollection<Document>(db).updateOne(
      { _id: fund._id },
      {
        $inc: { cashAnchor: syntheticPrincipal },
        $unset: { bondAllocations: "" },
        $set: { updatedAt: new Date() },
      }
    );
    updated++;
  }

  return {
    notes: [`migrated ${updated} funds to real-bond reserve model`],
    documentsScanned: funds.length,
    documentsUpdated: updated,
    documentsInserted: 0,
  };
}

export const migration: Migration = {
  id: "2026-06-02-index-fund-real-bonds",
  description:
    "Remove synthetic index-fund bondAllocations and restore cash for real sovereign purchases.",
  idempotent: true,
  execute: migrateIndexFundsToRealBonds,
};
