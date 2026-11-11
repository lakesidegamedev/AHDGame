import { NextResponse } from "next/server";
import { getDb } from "@/lib/mongodb";
import { requireAdmin } from "@/lib/api/requireAdmin";
import { handleRouteError } from "@/lib/api/errors";
import type { ShareListing, ShareOrder } from "@/lib/db/types";
import { corporationsCollection } from "@/lib/db/repositories/corporations";
import { shareOrdersCollection } from "@/lib/db/repositories/shareOrders";

/**
 * POST /api/admin/heal/corporation-shares
 * Recalculates totalShares for all corporations as:
 *   sum(shareholder shares) + publicFloat + shares reserved in open sell orders.
 * Fixes any mismatches caused by race conditions or past bugs.
 */
export async function POST() {
  try {
    const auth = await requireAdmin();
    if (!auth.ok) return auth.response;

    const db = await getDb();
    const corporations = await corporationsCollection(db).find({}).toArray();

    // Aggregate reserved shares per corporation.
    // Corporate sell orders and flagged character sell orders debit at creation.
    // Legacy unflagged character orders retain holdings and must not count twice.
    // Open listings also debit at creation and belong in the issued-share total.
    const reservedByCorp = new Map<string, number>();
    const openSellOrders = await shareOrdersCollection(db)
      .find({
        type: "sell",
        status: "open",
        $or: [{ placerCorporationId: { $exists: true } }, { sharesDebitedAtCreation: true }],
      })
      .toArray();
    for (const order of openSellOrders) {
      const key = order.corporationId.toString();
      reservedByCorp.set(key, (reservedByCorp.get(key) ?? 0) + order.sharesRemaining);
    }
    const openListings = await db
      .collection<ShareListing>("shareListings")
      .find({ status: "open" })
      .toArray();
    for (const listing of openListings) {
      const key = listing.corporationId.toString();
      reservedByCorp.set(key, (reservedByCorp.get(key) ?? 0) + listing.sharesRemaining);
    }

    const fixes: Array<{ name: string; before: number; after: number }> = [];

    for (const corp of corporations) {
      const shareholderTotal = (corp.shareholders ?? []).reduce(
        (sum, sh) => sum + (sh.shares ?? 0),
        0
      );
      const reservedInOrders = reservedByCorp.get(corp._id.toString()) ?? 0;
      const correctTotal = shareholderTotal + (corp.publicFloat ?? 0) + reservedInOrders;

      if (correctTotal !== (corp.totalShares ?? 0)) {
        await corporationsCollection(db).updateOne(
          { _id: corp._id },
          { $set: { totalShares: correctTotal } }
        );

        fixes.push({
          name: corp.name,
          before: corp.totalShares ?? 0,
          after: correctTotal,
        });
      }
    }

    return NextResponse.json({
      message: `Healed ${fixes.length} corporation(s)`,
      fixes,
      totalChecked: corporations.length,
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
