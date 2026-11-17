/** Bind physical electricity deliveries to the existing funded market cash and stock books. */
import type { SettleProducerMarketStageContext } from "@/lib/market/producerMarket/rules";
import type { PurchaseOrder } from "@/lib/market/producerMarket/producerQuotes";
import { bookKey } from "@/lib/market/producerMarket/bookKey";
import { createElectricityClearing } from "./clearing";
export function electricityMarketAdapter(context: SettleProducerMarketStageContext) {
  const network = context.input.electricityNetwork;
  if (network?.mode !== "enforced") return null;
  const orderSpent = new Map<string, number>();
  const target = (o: PurchaseOrder) =>
    Math.max(
      0,
      Math.min(
        o.units - (context.orderResults.get(o.id)?.deliveredUnits ?? 0),
        o.quantityGroup ? context.quantityGroups.get(o.quantityGroup.id)!.remaining : Infinity
      )
    );
  const budget = (o: PurchaseOrder) =>
    Math.max(
      0,
      Math.min(
        context.budgets.get(o.accountId) ?? 0,
        (o.maximumSpend ?? Number.MAX_VALUE) - (orderSpent.get(o.id) ?? 0),
        context.groupBudget(o)
      )
    );
  const engine = createElectricityClearing({
    network,
    offers: context.input.offers,
    checkBudget: context.input.checkBudget,
    available: (o) => context.remaining.get(o.id),
    target,
    budget,
    limits: (o, price) => [
      { id: `order:${o.id}`, coefficient: 1, capacity: target(o) },
      {
        id: `cash:${o.accountId}`,
        coefficient: price,
        capacity: context.budgets.get(o.accountId) ?? 0,
      },
      {
        id: `orderCash:${o.id}`,
        coefficient: price,
        capacity: (o.maximumSpend ?? Number.MAX_VALUE) - (orderSpent.get(o.id) ?? 0),
      },
      ...(o.spendGroup
        ? [{ id: `spend:${o.spendGroup.id}`, coefficient: price, capacity: context.groupBudget(o) }]
        : []),
      ...(o.quantityGroup
        ? [
            {
              id: `quantity:${o.quantityGroup.id}`,
              coefficient: 1,
              capacity: context.quantityGroups.get(o.quantityGroup.id)!.remaining,
            },
          ]
        : []),
    ],
    deliver: (order, offer, units, dispatched, price, path) => {
      const internal = order.accountId === offer.accountId,
        amount = units * price;
      if (!Number.isFinite(amount) || amount < 0) throw Error("Invalid electricity payment");
      context.recordDelivery(offer, order, units);
      context.remaining.set(offer.id, Math.max(0, context.remaining.get(offer.id) - dispatched));
      const buyer = context.orderResults.get(order.id)!,
        seller = context.offerResults.get(offer.id)!;
      buyer.deliveredUnits += units;
      buyer.cost += amount;
      seller.deliveredUnits += dispatched;
      if (order.quantityGroup) {
        const group = context.quantityGroups.get(order.quantityGroup.id)!;
        group.remaining = Math.max(0, group.remaining - units);
      }
      if (internal) {
        seller.internalDeliveredUnits += dispatched;
        context.recordInternal(offer, order, units);
      } else {
        seller.soldUnits += dispatched;
        seller.revenue += amount;
        context.budgets.set(
          order.accountId,
          Math.max(0, context.budgets.get(order.accountId)! - amount)
        );
        context.spendFromGroup(order, amount);
        context.debit(order.accountId, amount);
        context.cash.set(offer.accountId, context.credited(offer.accountId, amount));
        orderSpent.set(order.id, (orderSpent.get(order.id) ?? 0) + amount);
        const key = bookKey(order.commodity, order.book);
        const observed = context.prices.get(key) ?? {
          commodity: order.commodity,
          book: order.book,
          units: 0,
          value: 0,
          unitPrice: 0,
        };
        observed.units += units;
        observed.value += amount;
        observed.unitPrice = observed.value / observed.units;
        context.prices.set(key, observed);
      }
      if (
        context.tracked &&
        offer.countryId &&
        order.countryId &&
        offer.countryId !== order.countryId
      )
        context.countryBookRow(offer.countryId, "energy").exports += dispatched - units;
      context.tradeCount++;
      context.fills.push({
        orderId: order.id,
        kind: internal ? "internalTransfer" : "sale",
        units,
        unitPrice: price,
        sellerCountry: offer.countryId,
        buyerCountry: order.countryId,
        grid: { offerId: offer.id, dispatchedUnits: dispatched, path },
      });
    },
  });
  return engine;
}
