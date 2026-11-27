// DELETE: cancel an open/partial limit order, refund remaining escrow. Auth: requireAuthWithCharacter. Errors: 400, 401, 403, 404.
import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { getDb } from "@/lib/mongodb";
import { requireAuthWithCharacter } from "@/lib/api/requireAuth";
import { handleRouteError, forbidden, notFound, badRequest } from "@/lib/api/errors";
import { checkRateLimit, rateLimitResponse } from "@/lib/api/rateLimit";
import { isForexEnabled } from "@/lib/currency/featureFlag";
import { withAtomicEconomicCommand } from "@/lib/api/withAtomicEconomicCommand";
import { SETTLED_KEYS_FIELD } from "@/lib/banking/moneyMove";
import { charactersCollection } from "@/lib/db/repositories/characters";
import { currencyOrdersCollection } from "@/lib/db/repositories/currencyOrders";

interface RouteParams {
  params: Promise<{ orderId: string }>;
}

export async function DELETE(request: Request, { params }: RouteParams) {
  try {
    const forexActive = await isForexEnabled();
    if (!forexActive) throw forbidden("Currency exchange is not yet enabled");

    const auth = await requireAuthWithCharacter();
    if (!auth.ok) return auth.response;

    const rateCheck = checkRateLimit(`api/forex/orders/[orderId]:${auth.user.userId}`, 30, 60_000);
    if (!rateCheck.ok) return rateLimitResponse(rateCheck.retryAfter);

    const { orderId } = await params;
    if (!ObjectId.isValid(orderId)) throw badRequest("Invalid order ID");

    const db = await getDb();
    const { applyCancelRefund, cancelClaimKey, recoverFillClaim } =
      await import("@/lib/forex/fillRecovery");
    let order = await currencyOrdersCollection(db).findOne({ _id: new ObjectId(orderId) });

    if (!order) throw notFound("Order not found");
    if (order.characterId.toString() !== auth.user.character._id.toString()) {
      throw forbidden("You can only cancel your own orders");
    }
    if (order.status === "processing" && order.processingFill) {
      // A peer fill crashed after claiming. A stale claim is finished or
      // undone first so the cancel can proceed; a live one is never stolen.
      const recovery = await recoverFillClaim(db, order._id);
      if (recovery.outcome === "completed" || recovery.outcome === "rolled-back") {
        const reread = await currencyOrdersCollection(db).findOne({ _id: order._id });
        if (!reread) throw notFound("Order not found");
        order = reread;
      }
    }
    if (order.status !== "open" && order.status !== "partial") {
      throw badRequest("Only open or partial orders can be cancelled");
    }

    return await withAtomicEconomicCommand(db, async (db) => {
      const now = new Date();
      const claimed = await currencyOrdersCollection(db).findOneAndUpdate(
        {
          _id: order._id,
          characterId: auth.user.character._id,
          status: { $in: ["open", "partial"] },
          processingFillKey: { $exists: false },
        },
        { $set: { status: "cancelled", updatedAt: now } },
        { returnDocument: "before" }
      );
      if (!claimed) throw badRequest("Only open or partial orders can be cancelled");
      const remaining = claimed.amount - claimed.filledAmount;
      if (
        !Number.isFinite(remaining) ||
        remaining < 0 ||
        !Number.isFinite(claimed.filledAmount) ||
        claimed.filledAmount < 0
      )
        throw badRequest("Order escrow needs reconciliation before cancellation");
      let refundedAmount = 0;
      if (remaining > 0) {
        const key = cancelClaimKey(claimed._id.toHexString());
        const delivered = await applyCancelRefund(
          db,
          claimed.characterId,
          claimed.fromCurrency,
          remaining,
          key,
          now
        );
        if (delivered) refundedAmount = remaining;
        else {
          const proof = await charactersCollection(db).findOne(
            { _id: claimed.characterId, [SETTLED_KEYS_FIELD]: `${key}#refund` },
            { projection: { _id: 1 } }
          );
          if (!proof)
            throw new Error("FX cancellation recipient is unavailable; escrow remains held");
        }
      }
      return NextResponse.json({
        success: true,
        refundedAmount,
        refundedCurrency: claimed.fromCurrency,
      });
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
