import { withShareCancellationTransaction } from "./shareCancellationTransaction";
import type { Db, ObjectId } from "mongodb";
import type { Character, Corporation, ShareOrder } from "@/lib/db/types";
import type { ImperialCharacter } from "@/lib/db/types/imperialCharacter";
import { isForexEnabled } from "@/lib/currency/featureFlag";
import {
  buildPersonalBalanceInc,
  getHomeCurrency,
  loadCharacterFxRate,
} from "@/lib/currency/characterFunds";
import {
  anchorToCorpLiquidCapital,
  corpLiquidCapitalToAnchor,
  getCorpFxRate,
  resolveCorpLiquidCurrencyCode,
} from "@/lib/currency/corporationCapital";
import { creditShares, creditSharesToCorp } from "@/lib/corporations/shareholderOps";
import { emitTx } from "@/lib/financialTxLog/emit";
import { getCurrentTurn } from "@/lib/turn/currentTurn";
import { cancelFundShareOrder } from "@/lib/indexFunds/fundShareOrders";
import { corporationsCollection } from "@/lib/db/repositories/corporations";
import { charactersCollection } from "@/lib/db/repositories/characters";
import { shareOrdersCollection } from "@/lib/db/repositories/shareOrders";
import { imperialCharactersCollection } from "@/lib/db/repositories/imperialCharacters";

type CancelResult = { ok: true } | { ok: false; error: string };

/**
 * True when `actorCharacterId` may cancel this order: they authorized it, or
 * they are the sitting CEO of the corporation that placed it.
 */
export function actorMayCancelShareOrder(
  order: Pick<ShareOrder, "characterId" | "placerCorporationId">,
  actorCharacterId: ObjectId,
  placerCorp: Pick<Corporation, "ceoId" | "ceoVacant"> | null | undefined
): boolean {
  if (order.characterId?.equals(actorCharacterId)) return true;
  if (
    order.placerCorporationId &&
    placerCorp?.ceoId?.equals(actorCharacterId) &&
    placerCorp.ceoVacant !== true
  ) {
    return true;
  }
  return false;
}

/**
 * Cancel an open share order and refund the escrow / reserved shares.
 *
 * Used by:
 * - DELETE /api/corporations/[id]/shares/orders/[orderId] (player-initiated cancel)
 * - POST /api/corporations/[id]/shares/consolidate        (auto-cancel before restructure)
 */
export async function cancelShareOrderAndRefund(db: Db, order: ShareOrder): Promise<CancelResult> {
  return withShareCancellationTransaction(db, (transactionDb) =>
    cancelInTransaction(transactionDb, order)
  );
}

async function cancelInTransaction(db: Db, order: ShareOrder): Promise<CancelResult> {
  if (order.status !== "open") return { ok: false, error: "Order is not open" };

  const now = new Date();
  const claimFilter = {
    _id: order._id,
    status: "open" as const,
    sharesRemaining: order.sharesRemaining,
    escrowAmount: order.escrowAmount,
    activeShareFillKey: { $exists: false },
    ...(order.holdingTerms ? { holdingTerms: order.holdingTerms } : {}),
  };

  if (order.type === "buy") {
    const targetCorp = await corporationsCollection(db).findOne({ _id: order.corporationId });
    if (!targetCorp) {
      return { ok: false, error: "Target corporation not found" };
    }

    const targetFxRate = await getCorpFxRate(db, targetCorp);
    const refundAnchor = corpLiquidCapitalToAnchor(order.escrowAmount, targetCorp, targetFxRate);
    const currentTurn = await getCurrentTurn(db);

    if (order.placerCorporationId) {
      const placerCorp = await corporationsCollection(db).findOne({
        _id: order.placerCorporationId,
      });
      if (!placerCorp)
        return { ok: false, error: "Buyer corporation is missing; escrow remains held" };

      const placerFxRate = await getCorpFxRate(db, placerCorp);
      const refundInPlacerCapital = anchorToCorpLiquidCapital(
        refundAnchor,
        placerCorp,
        placerFxRate
      );

      const claim = await shareOrdersCollection(db).updateOne(claimFilter, {
        $set: { status: "cancelled", updatedAt: now },
      });
      if (claim.matchedCount === 0) return { ok: false, error: "Order is not open" };

      try {
        const refundResult = await corporationsCollection(db).updateOne(
          { _id: order.placerCorporationId },
          { $inc: { liquidCapital: refundInPlacerCapital }, $set: { updatedAt: now } }
        );
        if (refundResult.matchedCount === 0) {
          throw new Error("Buyer corporation not found");
        }

        await emitTx(db, {
          type: "stock_order_refund",
          turn: currentTurn,
          createdAt: now,
          subjectType: "corporation",
          subjectId: order.placerCorporationId,
          subjectName: placerCorp.name,
          amount: Math.round(refundInPlacerCapital * 100) / 100,
          currencyCode: resolveCorpLiquidCurrencyCode(placerCorp) ?? "USD",
          counterpartyType: "system",
          counterpartyName: "Order book escrow",
          meta: {
            orderId: order._id.toString(),
            orderType: order.type,
            targetCorporationId: order.corporationId.toString(),
            escrowAmountAnchor: Math.round(refundAnchor * 100) / 100,
          },
        });
      } catch (error) {
        throw error;
      }

      return { ok: true };
    }

    // Index-fund-owned buy orders refund anchor escrow to the fund cashAnchor.
    if (order.placerFundId) {
      await cancelFundShareOrder(db, order._id, currentTurn);
      return { ok: true };
    }

    if (!order.characterId) {
      return { ok: false, error: "Order has no owner to refund" };
    }
    const orderCharacterId = order.characterId;

    let charDoc:
      Pick<Character, "countryId" | "name"> | Pick<ImperialCharacter, "countryId" | "name"> | null =
      await charactersCollection(db).findOne(
        { _id: orderCharacterId },
        { projection: { countryId: 1, name: 1 } }
      );
    let collectionName: "characters" | "imperialCharacters" = "characters";
    if (!charDoc) {
      charDoc = await imperialCharactersCollection(db).findOne(
        { _id: orderCharacterId },
        { projection: { countryId: 1, name: 1 } }
      );
      collectionName = "imperialCharacters";
    }
    if (!charDoc) return { ok: false, error: "Order owner is missing; escrow remains held" };

    const owner = charDoc;
    const forexEnabled = await isForexEnabled();
    const homeCurrency = getHomeCurrency(owner);
    let charFxRate = 1.0;
    if (forexEnabled) {
      const fxResult = await loadCharacterFxRate(db, homeCurrency);
      if (!fxResult.ok) {
        return { ok: false, error: "Exchange rate unavailable, try again shortly" };
      }
      charFxRate = fxResult.rate;
    }
    const refundInHome = refundAnchor * charFxRate;

    const claim = await shareOrdersCollection(db).updateOne(claimFilter, {
      $set: { status: "cancelled", updatedAt: now },
    });
    if (claim.matchedCount === 0) return { ok: false, error: "Order is not open" };

    try {
      const refundResult = await db.collection(collectionName).updateOne(
        { _id: orderCharacterId },
        {
          $inc: buildPersonalBalanceInc(refundInHome, homeCurrency, forexEnabled),
          $set: { updatedAt: now },
        }
      );
      if (refundResult.matchedCount === 0) {
        throw new Error("Order owner not found");
      }

      await emitTx(db, {
        type: "stock_order_refund",
        turn: currentTurn,
        createdAt: now,
        subjectType: "character",
        subjectId: orderCharacterId,
        subjectName: owner.name ?? "(unknown)",
        amount: Math.round(refundInHome * 100) / 100,
        currencyCode: homeCurrency,
        counterpartyType: "system",
        counterpartyName: "Order book escrow",
        meta: {
          orderId: order._id.toString(),
          orderType: order.type,
          targetCorporationId: order.corporationId.toString(),
          escrowAmountAnchor: Math.round(refundAnchor * 100) / 100,
          imperial: collectionName === "imperialCharacters",
        },
      });
    } catch (error) {
      throw error;
    }

    return { ok: true };
  }

  const claim = await shareOrdersCollection(db).updateOne(claimFilter, {
    $set: { status: "cancelled", updatedAt: now },
  });
  if (claim.matchedCount === 0) return { ok: false, error: "Order is not open" };

  try {
    if (order.sharesDebitedAtCreation && order.placerCorporationId) {
      await creditSharesToCorp(
        db,
        order.corporationId,
        order.placerCorporationId,
        order.sharesRemaining,
        order.pricePerShare,
        { $set: { updatedAt: now } }
      );
    } else if (order.sharesDebitedAtCreation && order.characterId) {
      // Reserved-share restore for a character sell order (funds never sell here).
      const restored = await creditShares(
        db,
        order.corporationId,
        order.characterId,
        order.sharesRemaining,
        { $set: { updatedAt: now } },
        {
          pricePerShare: order.pricePerShare,
          ...(order.holdingTerms
            ? { holdingChange: { turn: await getCurrentTurn(db), restore: order.holdingTerms } }
            : {}),
        }
      );
      if (!restored) throw new Error("Reserved stock holding changed during cancellation");
    }
  } catch (error) {
    throw error;
  }

  return { ok: true };
}
