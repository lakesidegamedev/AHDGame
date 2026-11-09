/**
 * Production order observations feed shortage and price views without changing
 * trades. productionOrderOutcomes counts lower-price steps only when delivered.
 */
import type { ProducerMarketResult, PurchaseOrder } from "./rules";

/** Compact observations for downstream price and shortage views; never mutates a fill. */
export function productionOrderOutcomes(
  orders: readonly PurchaseOrder[],
  results: ProducerMarketResult["orders"],
  spilloverUnits: ReadonlyMap<string, number>
) {
  const meta = new Map(
    orders.map((o) => [
      o.id,
      {
        commodity: o.commodity,
        book: o.book,
        accountId: o.accountId,
        lowerStep: !!(o.demandStep && o.demandStep > 0),
      },
    ])
  );
  return results.flatMap((o) => {
    const m = meta.get(o.id);
    if (!m) return [];
    const { lowerStep, ...where } = m;
    // Lower-price ladder steps count only what they actually bought.
    const requestedUnits = lowerStep ? o.deliveredUnits : o.requestedUnits;
    const spilled = lowerStep ? 0 : Math.min(requestedUnits, spilloverUnits.get(o.id) ?? 0);
    return [
      {
        ...where,
        requestedUnits,
        deliveredUnits: o.deliveredUnits,
        ...(spilled > 0 ? { spilloverRequestedUnits: spilled } : {}),
      },
    ];
  });
}
