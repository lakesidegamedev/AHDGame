/**
 * Same-turn spillover of final demand (gameConfig.producerSpilloverStage >= 1).
 *
 * A household that wanted a good no seller has left (its lane sold out) keeps
 * its money. Realistically it substitutes: part of that budget goes to other
 * things it buys that are still on the shelves. After the first clearing, this
 * moves SUBSTITUTION_SHARE of each buyer's stranded spend onto its other lanes
 * that have unsold supply, in proportion to what the buyer wanted there, and
 * the market clears once more at the same posted prices. Offers never change, so
 * prices and the glut logic are untouched: only volume moves, and a buyer can
 * still spend no more than its own cash.
 *
 * Pure: orders, first-clearing outcomes and unsold supply in, new orders out.
 */
import type { PurchaseOrder } from "./rules";

export const SUBSTITUTION_SHARE = 0.7;

export interface SpilloverStats {
  /** Spend the buyers wanted in sold-out lanes and could not place. */
  strandedSpend: number;
  /** Extra spend offered to lanes that still had supply. */
  extraRequested: number;
}

export function spilloverOrders(input: {
  orders: readonly PurchaseOrder[];
  /** Accounts whose orders may spill (households). */
  accounts: ReadonlySet<string>;
  /** First-clearing outcome per order id. */
  outcomes: ReadonlyMap<string, { cost: number; deliveredUnits: number }>;
  /** Unsold units per [commodity, book] lane after the first clearing. */
  unsoldUnits: ReadonlyMap<string, number>;
  laneKey: (commodity: string, book: string) => string;
  share: number;
}): { orders: PurchaseOrder[]; stats: SpilloverStats } {
  const share = Number.isFinite(input.share) ? Math.max(0, Math.min(1, input.share)) : 0;
  const wanted = (o: PurchaseOrder) =>
    Math.min(o.units * o.maximumUnitPrice, o.maximumSpend ?? Number.MAX_VALUE);
  const byAccount = new Map<string, PurchaseOrder[]>();
  for (const o of input.orders) {
    if (!input.accounts.has(o.accountId) || o.supplierOfferId || o.quantityGroup) continue;
    const rows = byAccount.get(o.accountId) ?? [];
    rows.push(o);
    byAccount.set(o.accountId, rows);
  }
  const extraById = new Map<string, number>();
  let stranded = 0;
  let requested = 0;
  for (const rows of byAccount.values()) {
    let accountStranded = 0;
    const open: { order: PurchaseOrder; weight: number }[] = [];
    for (const o of rows) {
      const want = wanted(o);
      if (!(want > 0) || !Number.isFinite(want)) continue;
      const unsold = input.unsoldUnits.get(input.laneKey(o.commodity, o.book)) ?? 0;
      if (unsold > 1e-9) open.push({ order: o, weight: want });
      else {
        // Stranded is demand the lane could not serve: units that did not arrive,
        // valued at the buyer's ceiling. A lane that sold out but still delivered
        // every unit asked for, at a price under the ceiling, strands nothing.
        const delivered = input.outcomes.get(o.id)?.deliveredUnits ?? 0;
        accountStranded += Math.max(0, o.units - delivered) * o.maximumUnitPrice;
      }
    }
    stranded += accountStranded;
    const pool = accountStranded * share;
    const total = open.reduce((s, r) => s + r.weight, 0);
    if (!(pool > 0) || !(total > 0) || open.length === 0) continue;
    for (const { order, weight } of open) {
      const extra = (pool * weight) / total;
      extraById.set(order.id, extra);
      requested += extra;
    }
  }
  const orders = input.orders.map((o) => {
    const extra = extraById.get(o.id);
    if (!extra) return o;
    const spend = wanted(o) + extra;
    return {
      ...o,
      units: spend / o.maximumUnitPrice,
      maximumSpend: spend,
    };
  });
  return { orders, stats: { strandedSpend: stranded, extraRequested: requested } };
}
