/** Electricity clearing shares each physical link and pays only for actual deliveries. */
import type { ProducerOffer, PurchaseOrder } from "@/lib/market/producerMarket/producerQuotes";
import { eligibleSetOf } from "@/lib/market/producerMarket/producerQuotes";
import { createGridLedger, weightedShares } from "./paths";
import type { ElectricityNetwork, GridPath } from "./types";
export interface GridMarketHost {
  network: ElectricityNetwork;
  offers: readonly ProducerOffer[];
  checkBudget?: () => void;
  available: (offer: ProducerOffer) => number;
  target: (order: PurchaseOrder) => number;
  budget: (order: PurchaseOrder) => number;
  limits: (
    order: PurchaseOrder,
    price: number
  ) => { id: string; coefficient: number; capacity: number }[];
  deliver: (
    order: PurchaseOrder,
    offer: ProducerOffer,
    units: number,
    dispatched: number,
    price: number,
    path: readonly string[]
  ) => void;
}
export function createElectricityClearing(host: GridMarketHost) {
  const ledger = createGridLedger(host.network);
  const offers = host.offers.filter((o) => o.commodity === "energy");
  function clear(orders: readonly PurchaseOrder[], ownOnly = false) {
    const exhausted = new Set<string>();
    // Each successful wave exhausts a target, budget, supplier or link; the cap
    // prevents floating dust from keeping an otherwise completed book alive.
    for (
      let round = 0;
      round < orders.length + offers.length + host.network.links.length + 8;
      round++
    ) {
      host.checkBudget?.();
      const proposals: {
        order: PurchaseOrder;
        offer: ProducerOffer;
        path: GridPath;
        price: number;
        wanted: number;
      }[] = [];
      for (const order of orders) {
        const target = host.target(order);
        if (!(target > 1e-10)) continue;
        const eligible = eligibleSetOf(order);
        let chosen: (typeof proposals)[number] | undefined;
        for (const offer of offers) {
          if (
            exhausted.has(offer.id) ||
            offer.book !== order.book ||
            !(host.available(offer) > 1e-10) ||
            (eligible && !eligible.has(offer.id)) ||
            (order.supplierOfferId && order.supplierOfferId !== offer.id)
          )
            continue;
          const internal = offer.accountId === order.accountId;
          if (ownOnly && (!internal || offer.sellOutsideFirst)) continue;
          const path = ledger.path(offer, order);
          if (!path || !(ledger.capacity(path) > 1e-10)) continue;
          const price = internal
            ? 0
            : (order.contractUnitPrice ?? offer.unitPrice / path.retention);
          if (
            price > order.maximumUnitPrice + 1e-10 ||
            (price > 0 && !(host.budget(order) > 1e-10))
          )
            continue;
          const wanted = Math.min(
            target,
            host.available(offer) * path.retention,
            ledger.capacity(path),
            price > 0 ? host.budget(order) / price : target
          );
          if (!(wanted > 1e-10)) continue;
          const pick = { order, offer, path, price, wanted };
          const home = order.homeCountryFirst && offer.countryId === order.countryId;
          const oldHome =
            chosen && order.homeCountryFirst && chosen.offer.countryId === order.countryId;
          if (
            !chosen ||
            (internal && chosen.offer.accountId !== order.accountId) ||
            (internal === (chosen.offer.accountId === order.accountId) &&
              (Number(home) > Number(oldHome) ||
                (!!home === !!oldHome &&
                  (price < chosen.price ||
                    (price === chosen.price && offer.id < chosen.offer.id)))))
          )
            chosen = pick;
        }
        if (chosen) proposals.push(chosen);
      }
      if (!proposals.length) break;
      const shares = weightedShares(
        proposals.map((p) => p.wanted),
        proposals.map((p) => [
          {
            id: `offer:${p.offer.id}`,
            coefficient: 1 / p.path.retention,
            capacity: host.available(p.offer),
          },
          ...p.path.edges.map((e) => ({
            id: `link:${e.id}`,
            coefficient: e.retentionBefore / p.path.retention,
            capacity: ledger.remaining.get(e.id) ?? 0,
          })),
          ...host.limits(p.order, p.price),
        ])
      );
      let moved = 0;
      proposals.forEach((p, i) => {
        const units = Math.min(
          shares[i],
          host.target(p.order),
          host.available(p.offer) * p.path.retention,
          ledger.capacity(p.path),
          p.price > 0 ? host.budget(p.order) / p.price : Infinity
        );
        if (!(units > 1e-10)) return;
        const dispatched = ledger.take(p.path, units);
        host.deliver(
          p.order,
          p.offer,
          units,
          dispatched,
          p.price,
          p.path.edges.map((e) => e.id)
        );
        moved += units;
        if (host.available(p.offer) <= 1e-10) exhausted.add(p.offer.id);
      });
      if (!(moved > 1e-10)) break;
    }
  }
  return { clear, summary: ledger.summary };
}
