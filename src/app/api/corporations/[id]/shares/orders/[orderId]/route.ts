import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { getDb } from "@/lib/mongodb";
import { requireBasicAuth } from "@/lib/api/requireAuth";
import { handleRouteError, errorResponse } from "@/lib/api/errors";
import type { Corporation, ShareOrder, User } from "@/lib/db/types";
import type { ImperialCharacter } from "@/lib/db/types/imperialCharacter";
import { checkRateLimit, rateLimitResponse } from "@/lib/api/rateLimit";
import { rejectDuringTurn } from "@/lib/api/rejectDuringTurn";
import {
  actorMayCancelShareOrder,
  cancelShareOrderAndRefund,
} from "@/lib/corporations/cancelShareOrder";
import { corporationsCollection } from "@/lib/db/repositories/corporations";
import { charactersCollection } from "@/lib/db/repositories/characters";
import { shareOrdersCollection } from "@/lib/db/repositories/shareOrders";
import { imperialCharactersCollection } from "@/lib/db/repositories/imperialCharacters";

interface RouteParams {
  params: Promise<{ id: string; orderId: string }>;
}

/**
 * DELETE /api/corporations/[id]/shares/orders/[orderId]
 * Cancel an open share order.
 * Buy orders: escrow returned to the placer (character wallet or corp treasury).
 * Sell orders: reserved shares are restored when they were debited at creation.
 * The authorizing character, or the sitting CEO of a corp-placed order, may cancel.
 */
export async function DELETE(_request: Request, { params }: RouteParams) {
  try {
    const auth = await requireBasicAuth();
    if (!auth.ok) return auth.response;

    const rateLimit = checkRateLimit(
      `api/corporations/[id]/shares/orders/[orderId]:${auth.user.userId}`,
      20,
      60000
    );
    if (!rateLimit.ok) return rateLimitResponse(rateLimit.retryAfter);

    const { orderId } = await params;
    const db = await getDb();
    // The turn fills open orders from a snapshot of their escrow; a cancel
    // refunding that escrow mid-turn would let the fill spend it again.
    const turnGuard = await rejectDuringTurn(db);
    if (turnGuard) return turnGuard;

    if (!ObjectId.isValid(orderId)) {
      return errorResponse(400, "Invalid order ID");
    }

    const order = await shareOrdersCollection(db)
      .findOne({ _id: new ObjectId(orderId) });

    if (!order) {
      return errorResponse(404, "Order not found");
    }

    if (order.status !== "open") {
      return errorResponse(400, "Order is not open");
    }

    // Resolve character (regular or imperial)
    const userDoc = await db
      .collection<User>("users")
      .findOne({ _id: new ObjectId(auth.user.userId) });
    const isImperialMode =
      userDoc?.activeCharacterType === "imperial" && !!userDoc?.activeImperialCharacterId;

    let charId: ObjectId;

    if (isImperialMode) {
      const imperial = await imperialCharactersCollection(db).findOne({
        _id: userDoc!.activeImperialCharacterId!,
        userId: new ObjectId(auth.user.userId),
      });
      if (!imperial) {
        return errorResponse(404, "Imperial character not found");
      }
      charId = imperial._id;
    } else {
      const characterQuery = userDoc?.activeCharacterId
        ? { _id: userDoc.activeCharacterId, userId: new ObjectId(auth.user.userId) }
        : { userId: new ObjectId(auth.user.userId) };
      const character = await charactersCollection(db).findOne(characterQuery);
      if (!character) {
        return errorResponse(404, "Character not found");
      }
      charId = character._id;
    }

    let placerCorp: Pick<Corporation, "ceoId" | "ceoVacant"> | null = null;
    if (order.placerCorporationId && order.characterId?.toString() !== charId.toString()) {
      placerCorp = await corporationsCollection(db).findOne(
        { _id: order.placerCorporationId },
        { projection: { ceoId: 1, ceoVacant: 1 } }
      );
    }
    if (!actorMayCancelShareOrder(order, charId, placerCorp)) {
      return errorResponse(403, "Not your order");
    }

    const result = await cancelShareOrderAndRefund(db, order);
    if (!result.ok) {
      const status = result.error.startsWith("Exchange rate") ? 503 : 400;
      return errorResponse(status, result.error);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return handleRouteError(error);
  }
}
