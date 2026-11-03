/**
 * Political media settlement for the corporation turn.
 *
 * Funding, clearing plans and the money-move contract live in
 * `@/lib/politicalMedia/journal`; this is the shell that settles the orders the
 * clearing pass loaded and hands the product and editorial phases the seller
 * units and settled orders they account for. It sits beside `index.ts` instead
 * of inline so the phase reads as one call and the turn file stays under its
 * size cap.
 */
import type { Db } from "mongodb";
import {
  applyPoliticalMediaOrderEffects,
  settleLoadedPoliticalMediaOrders,
  type PoliticalMediaOrderForClearing,
  type PoliticalMediaSettlementPlan,
} from "@/lib/politicalMedia/journal";
import type { SettledPoliticalAttentionOrder } from "@/lib/mediaOperatingModels/reach";
import {
  paidPoliticalMediaSellerReceipts,
  type PaidPoliticalMediaSellerAmount,
} from "@/lib/products/rules/mediaProductSales";

export interface PoliticalMediaSettlementPhaseArgs {
  db: Db;
  /** Orders the clearing pass loaded, each possibly already carrying a plan. */
  orders: readonly PoliticalMediaOrderForClearing[];
  /** Turn the settlement's money moves are dated with. */
  turn: number;
  /** The game's current turn, which gates this turn's receipts and attention. */
  currentTurnNumber: number;
  /** Plans the clearing pre-pass saved durably for this turn. */
  plannedByOrderId: ReadonlyMap<string, PoliticalMediaSettlementPlan>;
  mediaProductSlatesEnabled: boolean;
}

export interface PoliticalMediaSettlementPhaseResult {
  /** Planned political advertising units per sector, for media product sales. */
  plannedUnitsBySectorId: Map<string, number>;
  /** Paid seller units and anchor per sector, for media product sales. */
  paidSellerBySectorId: Map<string, PaidPoliticalMediaSellerAmount>;
  /** Orders settled this turn, for editorial attention. */
  settledOrders: SettledPoliticalAttentionOrder[];
}

export async function settlePoliticalMediaOrdersTurn(
  args: PoliticalMediaSettlementPhaseArgs
): Promise<PoliticalMediaSettlementPhaseResult> {
  const { db, orders, turn, currentTurnNumber, plannedByOrderId, mediaProductSlatesEnabled } = args;
  const planOf = (order: PoliticalMediaOrderForClearing) =>
    order.settlementPlan ?? plannedByOrderId.get(order.orderId);

  const plannedUnitsBySectorId = new Map<string, number>();
  if (mediaProductSlatesEnabled) {
    for (const order of orders) {
      const plan = planOf(order);
      if (plan?.plannedTurn !== currentTurnNumber) continue;
      for (const seller of plan.sellers) {
        plannedUnitsBySectorId.set(
          seller.sectorId,
          (plannedUnitsBySectorId.get(seller.sectorId) ?? 0) + seller.units
        );
      }
    }
  }

  const paidSellerBySectorId = new Map<string, PaidPoliticalMediaSellerAmount>();
  const settledOrders: SettledPoliticalAttentionOrder[] = [];
  // New plans were already durably saved before the sector P&L writes. The
  // loaded order is an opening snapshot, so settling uses that plan instead of
  // issuing the same plan read and compare-and-set a second time.
  const settleable = orders.flatMap((order) => {
    const plan = planOf(order);
    return plan ? [{ ...order, settlementPlan: plan }] : [];
  });
  const outcomes = await settleLoadedPoliticalMediaOrders(db, settleable, turn);
  for (const order of settleable) {
    const plan = order.settlementPlan;
    const outcome = outcomes.get(order.orderId);
    if (!outcome) continue;
    if (mediaProductSlatesEnabled && plan.plannedTurn === currentTurnNumber) {
      for (const seller of paidPoliticalMediaSellerReceipts({
        orderId: order.orderId,
        sellers: plan.sellers,
        results: outcome.results,
        orderAlreadySettled: order.status === "settled",
      })) {
        const prior = paidSellerBySectorId.get(seller.sectorId) ?? { units: 0, amountAnchor: 0 };
        paidSellerBySectorId.set(seller.sectorId, {
          units: prior.units + seller.units,
          amountAnchor: prior.amountAnchor + seller.amountAnchor,
        });
      }
    }
    if (outcome.settled && plan.plannedTurn === currentTurnNumber) {
      settledOrders.push({
        orderId: order.orderId,
        status: "settled",
        identity: order.identity,
        settlementPlan: plan,
      });
    }
  }
  await applyPoliticalMediaOrderEffects(
    db,
    orders.map((order) => order.orderId)
  );
  return { plannedUnitsBySectorId, paidSellerBySectorId, settledOrders };
}
