import { NextResponse } from "next/server";
import { getDb } from "@/lib/mongodb";
import { requireAdmin } from "@/lib/api/requireAdmin";
import { handleRouteError } from "@/lib/api/errors";
import { bondsCollection } from "@/lib/db/repositories/bonds";
import { corporationsCollection } from "@/lib/db/repositories/corporations";
import { indexFundsCollection } from "@/lib/db/repositories/indexFunds";
import type { Document } from "mongodb";
import { indexFundPositionsCollection } from "@/lib/db/repositories/indexFundPositions";
import { indexFundTransactionsCollection } from "@/lib/db/repositories/indexFundTransactions";
import { indexFundRedemptionQueueCollection } from "@/lib/db/repositories/indexFundRedemptionQueue";
import { indexFundSnapshotsCollection } from "@/lib/db/repositories/indexFundSnapshots";

async function releaseFundHeldShares(db: Awaited<ReturnType<typeof getDb>>): Promise<{
  corporations: number;
  shares: number;
}> {
  const corporations = await corporationsCollection(db)
    .find({ "shareholders.fundId": { $exists: true } }, { projection: { _id: 1, shareholders: 1 } })
    .toArray();

  const ops = [];
  let releasedShares = 0;
  for (const corporation of corporations) {
    const fundHolders = (corporation.shareholders ?? []).filter((holder) => holder.fundId);
    if (fundHolders.length === 0) continue;
    const shares = fundHolders.reduce((sum, holder) => sum + Math.max(0, holder.shares ?? 0), 0);

    releasedShares += shares;
    ops.push({
      updateOne: {
        filter: { _id: corporation._id },
        update: {
          ...(shares > 0 ? { $inc: { publicFloat: shares } } : {}),
          $pull: { shareholders: { fundId: { $exists: true } } },
          $set: { updatedAt: new Date() },
        },
      },
    });
  }

  if (ops.length > 0) {
    await corporationsCollection(db).bulkWrite(ops);
  }

  return { corporations: ops.length, shares: releasedShares };
}

async function releaseFundHeldBonds(db: Awaited<ReturnType<typeof getDb>>): Promise<{
  bonds: number;
  units: number;
}> {
  const bonds = await bondsCollection(db)
    .find({ "holders.fundId": { $exists: true } }, { projection: { _id: 1, holders: 1 } })
    .toArray();

  const ops = [];
  let releasedUnits = 0;
  for (const bond of bonds) {
    const fundHolders = (bond.holders ?? []).filter((holder) => holder.fundId);
    if (fundHolders.length === 0) continue;
    const units = fundHolders.reduce((sum, holder) => sum + Math.max(0, holder.units ?? 0), 0);

    releasedUnits += units;
    ops.push({
      updateOne: {
        filter: { _id: bond._id },
        update: {
          ...(units > 0 ? { $inc: { publicFloat: units } } : {}),
          $pull: { holders: { fundId: { $exists: true } } },
          $set: { updatedAt: new Date() },
        },
      },
    });
  }

  if (ops.length > 0) {
    await bondsCollection(db).bulkWrite(ops);
  }

  return { bonds: ops.length, units: releasedUnits };
}

// DELETE /api/admin/investment-funds/clear — Delete all index fund data
// Also removes migration markers so re-enabling re-seeds fresh.
export async function DELETE() {
  try {
    const auth = await requireAdmin();
    if (!auth.ok) return auth.response;

    const db = await getDb();
    const [releasedShares, releasedBonds] = await Promise.all([
      releaseFundHeldShares(db),
      releaseFundHeldBonds(db),
    ]);

    const [fundResult, posResult, txnResult, snapResult, redeemResult] = await Promise.all([
      indexFundsCollection<Document>(db).deleteMany({}),
      indexFundPositionsCollection<Document>(db).deleteMany({}),
      indexFundTransactionsCollection<Document>(db).deleteMany({}),
      indexFundSnapshotsCollection<Document>(db).deleteMany({}),
      indexFundRedemptionQueueCollection<Document>(db).deleteMany({}),
    ]);

    // Also remove the bootstrap migration markers so re-enabling re-seeds.
    await db.collection<{ _id: string }>("migrationsRun").deleteMany({
      _id: {
        $in: [
          "2026-06-01-index-fund-foundation",
          "2026-06-01-index-fund-seed",
          "2026-06-02-index-fund-real-bonds",
        ],
      },
    });

    return NextResponse.json({
      success: true,
      deleted: {
        funds: fundResult.deletedCount,
        positions: posResult.deletedCount,
        transactions: txnResult.deletedCount,
        snapshots: snapResult.deletedCount,
        redemptions: redeemResult.deletedCount,
        fundHeldSharesReleased: releasedShares,
        fundHeldBondsReleased: releasedBonds,
      },
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
