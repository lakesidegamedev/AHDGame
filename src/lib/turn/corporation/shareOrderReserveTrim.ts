/**
 * Before resting share orders fill, a company whose cash is below its
 * operating reserve gets escrow back from its own open buy orders, newest
 * first, until the reserve is restored. The CEO is not there to confirm at
 * turn time, so an order only keeps escrow the company can spare; an order
 * the CEO confirmed past the reserve when placing it is left alone. Each
 * trimmed order records how much it gave back and why.
 *
 * Batched: one read per collection, one bulk write for orders and one for the
 * refunds. A refund is paid only for an order whose trim write landed.
 */
import type { AnyBulkWriteOperation, Db, ObjectId } from "mongodb";
import type { Corporation, ShareOrder } from "@/lib/db/types";
import { corporationsCollection } from "@/lib/db/repositories/corporations";
import { corporateSectorsCollection } from "@/lib/db/repositories/corporateSectors";
import { shareOrdersCollection } from "@/lib/db/repositories/shareOrders";
import {
  anchorToCorpLiquidCapital,
  corpLiquidCapitalToAnchor,
  loadFxRatesRecord,
  resolveCorpLiquidCurrencyCode,
} from "@/lib/currency/corporationCapital";
import type { CurrencyCode } from "@/lib/constants/currencies";
import {
  RESERVE_RECEIPT_PROJECTION,
  loadOperatingReserveTurns,
} from "@/lib/corporations/operatingReserveGuard";
import {
  restingOrderReserveTrim,
  restingOrderTrimReason,
  runningFlowsPerTurn,
  type ReserveReceipt,
} from "@/lib/corporations/rules/operatingReserve";
import { emitTxBulk, loadTxThresholds } from "@/lib/financialTxLog/emit";

export interface ReserveTrimSummary {
  ordersTrimmed: number;
  ordersReleased: number;
}

interface PlannedTrim {
  order: ShareOrder;
  placer: Pick<Corporation, "_id" | "name" | "liquidCurrencyCode">;
  sharesReleased: number;
  sharesAfter: number;
  escrowAfter: number;
  releasedLocal: number;
  releasesAll: boolean;
  reason: string;
}

export async function trimCorporateBuyOrdersToReserve(
  db: Db,
  now: Date,
  turn: number
): Promise<ReserveTrimSummary> {
  const summary: ReserveTrimSummary = { ordersTrimmed: 0, ordersReleased: 0 };
  const orders = (await shareOrdersCollection(db)
    .find({
      type: "buy",
      status: "open",
      placerCorporationId: { $exists: true },
      operatingReserveOverride: { $ne: true },
      activeShareFillKey: { $exists: false },
      sharesRemaining: { $gt: 0 },
      escrowAmount: { $gt: 0 },
    })
    .sort({ createdAt: -1 })
    .toArray()) as ShareOrder[];
  if (orders.length === 0) return summary;
  const turns = await loadOperatingReserveTurns(db);
  if (!(turns > 0)) return summary;

  const placerIds = [
    ...new Map(
      orders.map((o) => [o.placerCorporationId!.toHexString(), o.placerCorporationId!])
    ).values(),
  ];
  const corpIds = [...placerIds, ...orders.map((o) => o.corporationId)];
  const [corps, sectors, rates] = await Promise.all([
    corporationsCollection(db)
      .find(
        { _id: { $in: corpIds } },
        { projection: { _id: 1, name: 1, liquidCapital: 1, liquidCurrencyCode: 1 } }
      )
      .toArray(),
    corporateSectorsCollection(db)
      .find({ corporationId: { $in: placerIds } }, { projection: RESERVE_RECEIPT_PROJECTION })
      .toArray(),
    loadFxRatesRecord(db),
  ]);
  const corpById = new Map(corps.map((c) => [c._id.toHexString(), c]));
  const receiptsByCorp = new Map<string, ReserveReceipt[]>();
  for (const s of sectors) {
    if (!s.producerSettlement) continue;
    const key = s.corporationId.toHexString();
    receiptsByCorp.set(key, [...(receiptsByCorp.get(key) ?? []), s.producerSettlement]);
  }
  const fxOf = (corp: Pick<Corporation, "liquidCurrencyCode">) => {
    const code = resolveCorpLiquidCurrencyCode(corp) as CurrencyCode | null;
    const rate = code ? rates[code] : 1;
    return typeof rate === "number" && rate > 0 ? rate : null;
  };

  const planned: PlannedTrim[] = [];
  for (const placerId of placerIds) {
    const placerHex = placerId.toHexString();
    const placer = corpById.get(placerHex);
    if (!placer) continue;
    const placerFx = fxOf(placer);
    if (!placerFx) continue;
    const billsAnchor = runningFlowsPerTurn(receiptsByCorp.get(placerHex) ?? [], turn).bills;
    if (!(billsAnchor > 0)) continue;
    const reserveLocal = anchorToCorpLiquidCapital(billsAnchor, placer, placerFx) * turns;
    const cashLocal = placer.liquidCapital ?? 0;
    if (cashLocal >= reserveLocal) continue;

    // Escrow sits in the target's currency; the company's cash in its own.
    const toPlacerUnits = (o: ShareOrder, escrowTargetLocal: number) => {
      const target = corpById.get(o.corporationId.toHexString());
      const targetFx = target ? fxOf(target) : null;
      if (!target || !targetFx) return 0;
      return anchorToCorpLiquidCapital(
        corpLiquidCapitalToAnchor(escrowTargetLocal, target, targetFx),
        placer,
        placerFx
      );
    };
    const placerOrders = orders.filter((o) => o.placerCorporationId!.equals(placerId));
    const trims = restingOrderReserveTrim({
      cash: cashLocal,
      reserve: reserveLocal,
      orders: placerOrders.map((o) => ({
        id: o._id.toHexString(),
        sharesRemaining: o.sharesRemaining,
        escrowInBuyerUnits: toPlacerUnits(o, o.escrowAmount),
      })),
    });
    const currencyCode = resolveCorpLiquidCurrencyCode(placer) ?? "USD";
    for (const trim of trims) {
      const order = placerOrders.find((o) => o._id.toHexString() === trim.id)!;
      const releasesAll = trim.sharesReleased >= order.sharesRemaining;
      const keepShare = releasesAll ? 0 : 1 - trim.sharesReleased / order.sharesRemaining;
      const escrowAfter = order.escrowAmount * keepShare;
      const releasedLocal = toPlacerUnits(order, order.escrowAmount - escrowAfter);
      if (!(releasedLocal > 0)) continue;
      planned.push({
        order,
        placer,
        sharesReleased: trim.sharesReleased,
        sharesAfter: order.sharesRemaining - trim.sharesReleased,
        escrowAfter,
        releasedLocal,
        releasesAll,
        reason: restingOrderTrimReason({ releasedLocal, turns, currencyCode }),
      });
    }
  }
  if (planned.length === 0) return summary;

  const orderOps: AnyBulkWriteOperation<ShareOrder>[] = planned.map((p) => ({
    updateOne: {
      filter: {
        _id: p.order._id,
        status: "open",
        sharesRemaining: p.order.sharesRemaining,
        escrowAmount: p.order.escrowAmount,
        activeShareFillKey: { $exists: false },
      },
      update: {
        $set: {
          sharesRemaining: p.sharesAfter,
          escrowAmount: p.escrowAfter,
          ...(typeof p.order.escrowAnchor === "number"
            ? {
                escrowAnchor:
                  p.order.escrowAnchor * (p.releasesAll ? 0 : p.escrowAfter / p.order.escrowAmount),
              }
            : {}),
          ...(p.releasesAll ? { status: "cancelled" as const, cancelReason: p.reason } : {}),
          operatingReserveTrim: {
            turn,
            sharesReleased: p.sharesReleased,
            releasedLocal: Math.round(p.releasedLocal * 100) / 100,
            reason: p.reason,
          },
          updatedAt: now,
        },
      },
    },
  }));
  await shareOrdersCollection(db).bulkWrite(orderOps, { ordered: false });

  // Pay back only the trims whose guarded write landed.
  const written = await shareOrdersCollection(db)
    .find(
      { _id: { $in: planned.map((p) => p.order._id) }, "operatingReserveTrim.turn": turn },
      { projection: { _id: 1, sharesRemaining: 1, escrowAmount: 1 } }
    )
    .toArray();
  const landed = planned.filter((p) =>
    written.some(
      (w) =>
        w._id.equals(p.order._id) &&
        w.sharesRemaining === p.sharesAfter &&
        w.escrowAmount === p.escrowAfter
    )
  );
  if (landed.length === 0) return summary;

  const refundByPlacer = new Map<string, { id: ObjectId; amount: number }>();
  for (const p of landed) {
    const key = p.placer._id.toHexString();
    const prev = refundByPlacer.get(key);
    refundByPlacer.set(key, { id: p.placer._id, amount: (prev?.amount ?? 0) + p.releasedLocal });
    if (p.releasesAll) summary.ordersReleased += 1;
    else summary.ordersTrimmed += 1;
  }
  const refunds = await corporationsCollection(db).bulkWrite(
    [...refundByPlacer.values()].map((r) => ({
      updateOne: {
        filter: { _id: r.id },
        update: { $inc: { liquidCapital: r.amount }, $set: { updatedAt: now } },
      },
    })),
    { ordered: false }
  );
  if (refunds.matchedCount !== refundByPlacer.size)
    throw new Error("Reserve trim could not refund every buyer corporation");

  await emitTxBulk(
    db,
    landed.map((p) => ({
      type: "stock_order_refund" as const,
      turn,
      createdAt: now,
      subjectType: "corporation" as const,
      subjectId: p.placer._id,
      subjectName: p.placer.name,
      amount: Math.round(p.releasedLocal * 100) / 100,
      currencyCode: resolveCorpLiquidCurrencyCode(p.placer) ?? "USD",
      counterpartyType: "system" as const,
      counterpartyName: "Order book escrow",
      meta: {
        orderId: p.order._id.toString(),
        orderType: "buy",
        targetCorporationId: p.order.corporationId.toString(),
        sharesReleased: p.sharesReleased,
        reason: "operating_reserve",
      },
    })),
    await loadTxThresholds(db)
  );
  return summary;
}
