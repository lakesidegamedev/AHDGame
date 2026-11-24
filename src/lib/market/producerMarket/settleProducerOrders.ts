import { electricityMarketAdapter } from "@/lib/electricityNetwork/rules/marketAdapter";
import type { ProducerMarketResult } from "@/lib/market/producerMarket/rules";
import type { ProducerOffer, PurchaseOrder } from "@/lib/market/producerMarket/producerQuotes";
import { eligibleSetOf, compareId } from "@/lib/market/producerMarket/producerQuotes";
import { ProducerSupplyPool } from "@/lib/market/producerMarket/supplyPoolRules";
import { bookKey } from "@/lib/market/producerMarket/bookKey";
import { curveSegments, type CurveSegment } from "@/lib/market/producerMarket/curveSegments";

import { sortFundedCountryBookRows } from "@/lib/market/producerMarket/fundedBookRules";
import { capSharedShares, proRataShares } from "@/lib/market/producerMarket/publicFairShareRules";
import type {
  SettleProducerMarketStageContext,
  RoutedPool,
} from "@/lib/market/producerMarket/rules";

export function settleProducerOrders(
  context: SettleProducerMarketStageContext
): ProducerMarketResult {
  const electricity = electricityMarketAdapter(context);
  if (electricity && context.input.ownSitesFirst)
    electricity.clear(
      context.orders.filter(
        (o) =>
          o.commodity === "energy" &&
          !o.supplierOfferId &&
          o.contractUnitPrice == null &&
          !o.quantityGroup &&
          !context.marketFirst.has(o.accountId)
      ),
      true
    );
  const clearFairGroup = (group: readonly PurchaseOrder[]): void => {
    const members = group.map((order) => {
      const quantityGroup =
        order.quantityGroup && context.quantityGroups.get(order.quantityGroup.id);
      const carriedOrder = context.carried.get(order.id);
      let wanted = carriedOrder
        ? carriedOrder.wanted
        : Math.min(order.units, quantityGroup?.remaining ?? order.units);
      const ownTake = (0, context.fillOwnStock)(order, wanted);
      wanted = Math.max(0, wanted - ownTake);
      if (quantityGroup && ownTake > 0)
        quantityGroup.remaining = Math.max(0, quantityGroup.remaining - ownTake);
      return {
        order,
        eligible: eligibleSetOf(order),
        quantityGroup,
        wanted,
        orderLimitId: JSON.stringify(["order", order.id]),
        accountLimitId: JSON.stringify(["account", order.accountId]),
        spendLimitId: order.spendGroup && JSON.stringify(["spend", order.spendGroup.id]),
        quantityLimitId:
          order.quantityGroup && JSON.stringify(["quantity", order.quantityGroup.id]),
        orderBudget: carriedOrder
          ? carriedOrder.orderBudget
          : (order.maximumSpend ?? Number.MAX_VALUE),
      };
    });
    type Member = (typeof members)[number];
    const key = bookKey(group[0].commodity, group[0].book);
    const routed = members.some((m) => m.eligible);
    // Reachability depends on route classes, not the number of plants sharing
    // each class. Reuse member cohorts across every supplier and price level.
    const classes = [...new Set(members.map((m) => m.eligible))];
    const classOf = new Map(classes.map((set, i) => [set, i]));
    const cohortMembers = new Map<string, Member[]>();
    const reachability = new Map<string, { key: string; live: Member[] }>();
    const reachable = (supplier: ProducerOffer) => {
      let result = reachability.get(supplier.id);
      if (!result) {
        const indices = classes.flatMap((set, i) => (!set || set.has(supplier.id) ? [i] : []));
        const key = JSON.stringify(indices);
        let live = cohortMembers.get(key);
        if (!live) {
          const allowed = new Set(indices);
          live = members.filter((m) => allowed.has(classOf.get(m.eligible)!));
          cohortMembers.set(key, live);
        }
        result = { key, live };
        reachability.set(supplier.id, result);
      }
      return result;
    };
    // With the seller preference curve on, the group first draws each
    // (price, preference) seller group by its curve share; the cheapest-first
    // levels then clear whatever the members could not take there (budgets and
    // limit prices differ per member, and routes limit who reaches whom).
    const pools = context.sortedPoolsByBook.get(key) ?? [];
    const curveFirst = context.input.demandCurve
      ? curveSegments({
          pools,
          offersByPool: context.offersByPool,
          remaining: context.remaining,
          wanted: members.reduce((sum, m) => sum + Math.max(0, m.wanted), 0),
          maximumUnitPrice: Math.max(...members.map((m) => m.order.maximumUnitPrice)),
          budget: Number.MAX_VALUE,
          curve: context.input.demandCurve,
          ...(routed
            ? { reachable: (offer: ProducerOffer) => reachable(offer).live.length > 0 }
            : {}),
        })
      : null;
    const segments = [
      ...(curveFirst ?? []).map((segment) => ({
        price: segment.price,
        pool: segment.pool,
        curve: segment as CurveSegment | undefined,
      })),
      ...pools.map(([price, pool]) => ({ price, pool, curve: undefined })),
    ];
    for (const { price, pool, curve } of segments) {
      context.input.checkBudget?.();
      // What a member could still buy at this level: target, reservation group,
      // limit price, and the order, account and spend-group budgets.
      const capOf = (m: Member): number => {
        if (!(m.wanted > 0) || price > m.order.maximumUnitPrice) return 0;
        const units = Math.min(m.wanted, m.quantityGroup?.remaining ?? m.wanted);
        const budget = Math.min(
          context.budgets.get(m.order.accountId)!,
          m.orderBudget,
          (0, context.groupBudget)(m.order)
        );
        return Math.min(units, price > 0 ? budget / price : units);
      };
      // Unrestricted books retain their lazy pooled path. With routes, propose
      // shares at each reachable supplier simultaneously, so the first buyer
      // cannot drain a supplier before another eligible buyer gets its share.
      // Sellers reachable by the same buyers are interchangeable at this price.
      // Group them once rather than retaining an order-by-supplier fill matrix.
      const cohorts = new Map<string, { suppliers: ProducerOffer[]; live: Member[] }>();
      if (routed) {
        for (const supplier of curve ? curve.offers : (context.offersByPool.get(pool) ?? [])) {
          const { key, live } = reachable(supplier);
          if (live.length === 0) continue;
          const cohort = cohorts.get(key) ?? {
            suppliers: [],
            live,
          };
          cohort.suppliers.push(supplier);
          cohorts.set(key, cohort);
        }
      }
      const levels: { suppliers: readonly ProducerOffer[] | undefined; live: Member[] }[] = routed
        ? [...cohorts.values()]
        : [{ suppliers: curve && !curve.wholePool ? curve.offers : undefined, live: members }];
      // Within one price/reachability cohort every purchase draws the same
      // pro-rata seller mix. Use the existing lazy stock primitive instead of
      // walking every seller for every buyer. Flush once before another price
      // or group can observe this stock. Country totals share the same mix;
      // same-owner management values retain their individual site legs.
      const routedPools = new Map<readonly ProducerOffer[] | undefined, RoutedPool>();
      for (const { suppliers } of levels) {
        if (!suppliers && !context.tracked) continue;
        const sellers = suppliers ?? context.offersByPool.get(pool) ?? [];
        const stock = suppliers ? new ProducerSupplyPool() : pool;
        const countries = new Map<string | undefined, { offer: ProducerOffer; units: number }>();
        const internal = new Map<string, { offer: ProducerOffer; units: number }[]>();
        for (const offer of sellers) {
          const units = context.remaining.get(offer.id);
          if (suppliers) stock.add(offer.id, units);
          if (context.tracked) {
            const row = countries.get(offer.countryId) ?? { offer, units: 0 };
            row.units += units;
            countries.set(offer.countryId, row);
          }
          if (context.tracked && units > 0 && (offer.internalUnitPrice ?? 0) > 0) {
            const owned = internal.get(offer.accountId) ?? [];
            owned.push({ offer, units });
            internal.set(offer.accountId, owned);
          }
        }
        routedPools.set(suppliers, {
          stock,
          total: stock.total,
          countries: [...countries.values()],
          internal,
        });
      }
      // A curve segment sells at most its curve share. Every proposal at this
      // level shares that cap, so routed cohorts split it the same way they
      // split a level's stock today.
      const segmentLimit = curve ? { left: curve.units } : undefined;
      const supplyOf = (suppliers: readonly ProducerOffer[] | undefined) =>
        Math.min(
          suppliers ? routedPools.get(suppliers)!.stock.total : pool.total,
          segmentLimit?.left ?? Infinity
        );
      for (let round = 0; round <= members.length + cohorts.size; round++) {
        const proposals = levels.flatMap(({ suppliers, live: candidates }) => {
          const supply = supplyOf(suppliers);
          if (!(supply > 0)) return [];
          const live = candidates.filter((m) => capOf(m) > 0);
          const shares = proRataShares(
            supply,
            live.map((m) => ({ weight: m.wanted, cap: capOf(m) }))
          );
          return live.map((m, i) => ({ m, suppliers, units: shares[i] }));
        });
        if (proposals.length === 0) break;
        const shares = capSharedShares(
          proposals.map((p) => p.units),
          proposals.map(({ m }) => [
            { id: m.orderLimitId, units: capOf(m) },
            {
              id: m.accountLimitId,
              units: price > 0 ? context.budgets.get(m.order.accountId)! / price : Infinity,
            },
            ...(m.order.spendGroup
              ? [
                  {
                    id: m.spendLimitId!,
                    units: price > 0 ? (0, context.groupBudget)(m.order) / price : Infinity,
                  },
                ]
              : []),
            ...(m.order.quantityGroup
              ? [{ id: m.quantityLimitId!, units: m.quantityGroup!.remaining }]
              : []),
            ...(segmentLimit ? [{ id: "segment", units: segmentLimit.left }] : []),
          ])
        );
        let short = false;
        let moved = 0;
        proposals.forEach(({ m, suppliers, units }, i) => {
          const supply = supplyOf(suppliers);
          const take = Math.min(shares[i], capOf(m), supply);
          if (take < units - 1e-9 * Math.max(1, units)) short = true;
          if (!(take > 0)) return;
          const amount = (0, context.buyFromPool)(
            m.order,
            price,
            pool,
            take,
            suppliers,
            supply,
            routedPools.get(suppliers)
          );
          moved += take;
          if (segmentLimit) segmentLimit.left = Math.max(0, segmentLimit.left - take);
          m.wanted = Math.max(0, m.wanted - take);
          if (m.quantityGroup)
            m.quantityGroup.remaining = Math.max(0, m.quantityGroup.remaining - take);
          m.orderBudget = Math.max(0, m.orderBudget - amount);
        });
        if (!short || !(moved > 0)) break;
      }
      for (const [suppliers, lazy] of routedPools) {
        if (!suppliers) continue; // The ordinary pool is flushed once at market close.
        for (const offer of suppliers) {
          const units = lazy.stock.pooledSold(offer.id);
          if (!(units > 0)) continue;
          context.remaining.set(
            offer.id,
            Math.min(context.remaining.get(offer.id), lazy.stock.remaining(offer.id))
          );
          const seller = context.offerResults.get(offer.id)!;
          const amount = units * price;
          seller.soldUnits += units;
          seller.deliveredUnits += units;
          seller.revenue += amount;
          context.cash.set(offer.accountId, (0, context.credited)(offer.accountId, amount));
        }
      }
    }
  };
  // Phase 2: the ordinary book pass over every order at its residual target.
  const clearOrder = (order: PurchaseOrder): void => {
    context.input.checkBudget?.();
    const fairGroup = context.fairGroupOf.get(order.id);
    if (electricity && order.commodity === "energy") {
      if (!fairGroup || fairGroup[0] === order) electricity.clear(fairGroup ?? [order]);
      return;
    }
    if (fairGroup) {
      // The whole group clears at its first member's place in the queue.
      if (fairGroup[0] === order) clearFairGroup(fairGroup);
      return;
    }
    const quantityGroup = order.quantityGroup && context.quantityGroups.get(order.quantityGroup.id);
    const carriedOrder = context.carried.get(order.id);
    let wanted = carriedOrder
      ? carriedOrder.wanted
      : Math.min(order.units, quantityGroup?.remaining ?? order.units);
    let orderBudget = carriedOrder
      ? carriedOrder.orderBudget
      : (order.maximumSpend ?? Number.MAX_VALUE);
    const eligible = eligibleSetOf(order) ?? null;
    const key = bookKey(order.commodity, order.book);
    if (!eligible && !order.supplierOfferId && order.contractUnitPrice == null) {
      const ownTake = (0, context.fillOwnStock)(order, wanted);
      wanted = Math.max(0, wanted - ownTake);
      if (quantityGroup && ownTake > 0)
        quantityGroup.remaining = Math.max(0, quantityGroup.remaining - ownTake);
      const pools = context.sortedPoolsByBook.get(key) ?? [];
      const curve =
        context.input.demandCurve && wanted > 0
          ? curveSegments({
              pools,
              offersByPool: context.offersByPool,
              remaining: context.remaining,
              wanted,
              maximumUnitPrice: order.maximumUnitPrice,
              budget: Math.min(
                context.budgets.get(order.accountId)!,
                orderBudget,
                (0, context.groupBudget)(order)
              ),
              curve: context.input.demandCurve,
            })
          : null;
      if (curve) {
        for (const segment of curve) {
          const take = Math.min(segment.units, wanted);
          if (!(take > 0)) continue;
          const amount = segment.wholePool
            ? (0, context.buyFromPool)(order, segment.price, segment.pool, take)
            : (0, context.buyFromPool)(
                order,
                segment.price,
                segment.pool,
                take,
                segment.offers,
                segment.total
              );
          wanted = Math.max(0, wanted - take);
          if (quantityGroup) quantityGroup.remaining = Math.max(0, quantityGroup.remaining - take);
          orderBudget = Math.max(0, orderBudget - amount);
        }
        return;
      }
      for (const [price, pool] of pools) {
        if (!(wanted > 0) || price > order.maximumUnitPrice) break;
        const budget = Math.min(
          context.budgets.get(order.accountId)!,
          orderBudget,
          (0, context.groupBudget)(order)
        );
        const take = Math.min(wanted, pool.total, price > 0 ? budget / price : wanted);
        if (!(take > 0)) continue;
        const amount = (0, context.buyFromPool)(order, price, pool, take);
        wanted = Math.max(0, wanted - take);
        if (quantityGroup) quantityGroup.remaining = Math.max(0, quantityGroup.remaining - take);
        orderBudget = Math.max(0, orderBudget - amount);
      }
      return;
    }
    const rows = (context.byBook.get(key) ?? []).filter(
      (offer) =>
        (offer.accountId === order.accountId ||
          (order.contractUnitPrice ?? offer.unitPrice) <= order.maximumUnitPrice) &&
        (!order.supplierOfferId || order.supplierOfferId === offer.id) &&
        (!eligible || eligible.has(offer.id))
    );
    const tiers = new Map<number, ProducerOffer[]>();
    for (const offer of rows) {
      const price =
        offer.accountId === order.accountId ? 0 : (order.contractUnitPrice ?? offer.unitPrice);
      const tier = tiers.get(price) ?? [];
      tier.push(offer);
      tiers.set(price, tier);
    }
    for (const [, tier] of [...tiers].sort(([a], [b]) => a - b)) {
      // At an identical price, using owned stock needs no outside financing.
      // Outside suppliers at that price split the remaining purchase pro rata.
      for (const internal of [true, false]) {
        const group = tier.filter((o) => (o.accountId === order.accountId) === internal);
        const total = group.reduce((n, o) => n + context.remaining.get(o.id)!, 0);
        const price = order.contractUnitPrice ?? group[0]?.unitPrice ?? 0;
        const budget = Math.min(
          context.budgets.get(order.accountId)!,
          orderBudget,
          (0, context.groupBudget)(order)
        );
        const take = Math.min(wanted, total, internal || price === 0 ? wanted : budget / price);
        if (!(take > 0) || !(total > 0)) continue;
        context.fills.push(
          (0, context.fillsWithCountries)(
            order,
            {
              orderId: order.id,
              kind: internal ? "internalTransfer" : "sale",
              unitPrice: internal ? 0 : price,
              units: take,
            },
            group
          )
        );
        for (const offer of group) {
          const available = context.remaining.get(offer.id)!;
          const units = Math.min(available, (take / total) * available);
          if (!(units > 0)) continue;
          (0, context.recordDelivery)(offer, order, units);
          // Moving owned goods between sites is a physical transfer. It cannot
          // create a sale, an acquisition asset or profit for the corporation.
          const unitPrice = internal ? 0 : price;
          const amount = units * unitPrice;
          if (!Number.isFinite(amount)) throw new Error("Non-finite trade value");
          context.tradeCount++;
          if (!internal) {
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
          wanted = Math.max(0, wanted - units);
          if (quantityGroup) quantityGroup.remaining = Math.max(0, quantityGroup.remaining - units);
          context.remaining.set(offer.id, Math.max(0, available - units));
          if (!internal) {
            orderBudget = Math.max(0, orderBudget - amount);
            context.budgets.set(
              order.accountId,
              Math.max(0, context.budgets.get(order.accountId)! - amount)
            );
            (0, context.spendFromGroup)(order, amount);
            (0, context.debit)(order.accountId, amount);
            context.cash.set(offer.accountId, (0, context.credited)(offer.accountId, amount));
          }
          const buyer = context.orderResults.get(order.id)!;
          buyer.deliveredUnits += units;
          buyer.cost += amount;
          const seller = context.offerResults.get(offer.id)!;
          if (internal) {
            seller.internalDeliveredUnits += units;
            (0, context.recordInternal)(offer, order, units);
            buyer.internalDeliveredUnits = (buyer.internalDeliveredUnits ?? 0) + units;
          } else seller.soldUnits += units;
          seller.deliveredUnits += units;
          seller.revenue += amount;
        }
      }
      if (!(wanted > 0)) break;
    }
  };
  // Market-first companies buy last, so outside buyers clear their output first.
  // A site that opted to sell outside first defers its company's orders the same way.
  const outsideFirstAccounts = new Set(
    context.input.ownSitesFirst
      ? context.input.offers
          .filter((offer) => offer.sellOutsideFirst)
          .map((offer) => offer.accountId)
      : []
  );
  const deferred: PurchaseOrder[] = [];
  const afterMarket: PurchaseOrder[] = [];
  for (const order of context.orders) {
    if (order.afterMarket) afterMarket.push(order);
    else if (context.marketFirst.has(order.accountId) || outsideFirstAccounts.has(order.accountId))
      deferred.push(order);
    else clearOrder(order);
  }
  for (const order of deferred) clearOrder(order);
  // Spill pass: after every order has cleared its own book, what a buyer still
  // wants is offered to leftover supply in its neighbouring states' books.
  for (const order of context.orders) {
    if (electricity && order.commodity === "energy") continue;
    if (order.afterMarket || !order.spillBooks?.length) continue;
    if (order.supplierOfferId || order.contractUnitPrice != null) continue;
    if (order.quantityGroup || order.eligibleOfferIds) continue;
    let wanted = order.units - (context.orderResults.get(order.id)?.deliveredUnits ?? 0);
    let orderBudget = Math.max(
      0,
      (order.maximumSpend ?? Number.MAX_VALUE) - (context.orderResults.get(order.id)?.cost ?? 0)
    );
    for (const spillBook of order.spillBooks) {
      if (!(wanted > 0)) break;
      const byPrice = new Map<number, ProducerOffer[]>();
      for (const offer of context.byBook.get(bookKey(order.commodity, spillBook)) ?? []) {
        if (offer.countryId !== order.countryId) continue;
        const level = byPrice.get(offer.unitPrice) ?? [];
        level.push(offer);
        byPrice.set(offer.unitPrice, level);
      }
      if (byPrice.size === 0) continue;
      ({ wanted, orderBudget } = context.fillLocalOffers(order, wanted, orderBudget, byPrice, {
        spillBook,
      }));
    }
  }
  // Wider-economy seller: what an order still wants after every pass above may
  // come from its fallback offers, which sit on their own book, so a real
  // seller always sells first.
  const fallbackOffers = new Map<string, ProducerOffer>();
  {
    const wanted = new Set<string>();
    for (const order of context.orders)
      for (const id of order.fallbackOfferIds ?? []) wanted.add(id);
    if (wanted.size > 0)
      for (const offer of context.input.offers)
        if (wanted.has(offer.id)) fallbackOffers.set(offer.id, offer);
  }
  // Buyers in the seller's own country come first; export orders (a
  // background country's imports) take what is left in a second pass.
  const fallbackPass = (home: boolean) => {
    for (const order of fallbackOffers.size > 0 ? context.orders : []) {
      if (order.afterMarket || !order.fallbackOfferIds?.length) continue;
      if (electricity && order.commodity === "energy") continue;
      const settled = context.orderResults.get(order.id)!;
      const quantityGroup =
        order.quantityGroup && context.quantityGroups.get(order.quantityGroup.id);
      const wanted = Math.min(
        order.units - settled.deliveredUnits,
        quantityGroup ? quantityGroup.remaining : Number.MAX_VALUE
      );
      // Rounding dust left on a filled order is not demand.
      if (!(wanted > 1e-9 * Math.max(1, order.units))) continue;
      const byPrice = new Map<number, ProducerOffer[]>();
      let book: string | undefined;
      for (const id of order.fallbackOfferIds) {
        const offer = fallbackOffers.get(id);
        if (!offer || offer.commodity !== order.commodity) continue;
        if ((offer.countryId === order.countryId) !== home) continue;
        book ??= offer.book;
        if (offer.book !== book) continue;
        const level = byPrice.get(offer.unitPrice) ?? [];
        level.push(offer);
        byPrice.set(offer.unitPrice, level);
      }
      if (!book) continue;
      const spendLeft = Math.max(0, (order.maximumSpend ?? Number.MAX_VALUE) - settled.cost);
      context.fillLocalOffers(
        order,
        wanted,
        order.fallbackCashOnly
          ? Math.min(spendLeft, Math.max(0, context.cash.get(order.accountId) ?? 0))
          : spendLeft,
        byPrice,
        { spillBook: book }
      );
    }
  };
  fallbackPass(true);
  fallbackPass(false);
  // After-market orders take only what every other buyer left.
  for (const order of afterMarket) clearOrder(order);
  for (const offer of context.input.offers) {
    if (!context.poolByOffer.get(offer.id)!.hasPooledSales) continue;
    const seller = context.offerResults.get(offer.id)!;
    const units = context.poolByOffer.get(offer.id)!.pooledSold(offer.id);
    const amount = units * offer.unitPrice;
    seller.soldUnits += units;
    seller.deliveredUnits += units;
    seller.revenue += amount;
    context.cash.set(offer.accountId, (0, context.credited)(offer.accountId, amount));
  }
  if (context.tracked) {
    for (const order of context.input.orders) {
      const row = (0, context.regionalBookRow)(order);
      if (!row) continue;
      const delivered = context.orderResults.get(order.id)?.deliveredUnits ?? 0;
      row.filled += delivered;
      if (order.demandStep && order.demandStep > 0) row.funded += delivered;
    }
    for (const [key, units] of context.deliveredAcross) {
      const [seller, buyer, commodity] = JSON.parse(key) as [string, string, string];
      (0, context.countryBookRow)(buyer, commodity).imports += units;
      (0, context.countryBookRow)(seller, commodity).exports += units;
    }
    for (const order of context.input.orders) {
      if (!(order.demandStep && order.demandStep > 0) || !order.countryId) continue;
      const bought = context.orderResults.get(order.id)?.deliveredUnits ?? 0;
      if (!(bought > 0)) continue;
      // What a lower step bought was asked for, paid for and received, so it
      // joins demand, requested and funded alike.
      const row = (0, context.countryBookRow)(order.countryId, order.commodity);
      row.demand += bought;
      row.requested = (row.requested ?? 0) + bought;
      row.funded = (row.funded ?? 0) + bought;
    }
  }
  return {
    ...(electricity ? { electricity: electricity.summary() } : {}),
    accounts: [...context.cash]
      .sort(([a], [b]) => compareId(a, b))
      .map(([id, value]) => ({ id, cash: value })),
    tradeReceipt: {
      turn: context.input.turn,
      offers: context.input.offers,
      orders: context.input.orders,
      fills: context.fills,
      tradeCount: context.tradeCount,
    },
    offers: [...context.offerResults.values()].sort((a, b) => compareId(a.id, b.id)),
    orders: [...context.orderResults.values()].sort((a, b) => compareId(a.id, b.id)),
    ...(context.internalDeliveries
      ? {
          internalDeliveries: [...context.internalDeliveries.values()].sort(
            (a, b) => compareId(a.offerId, b.offerId) || compareId(a.orderId, b.orderId)
          ),
        }
      : {}),
    prices: [...context.prices.values()].sort((a, b) =>
      compareId(bookKey(a.commodity, a.book), bookKey(b.commodity, b.book))
    ),
    ...(context.tracked
      ? {
          countryBooks: sortFundedCountryBookRows(
            (0, context.filledByCountry)(
              context.input.orders,
              context.orderResults,
              context.countryBookRow,
              context.countryBookRows
            )
          ),
          ...(context.regionalBookRows.size > 0
            ? {
                regionalBooks: [...context.regionalBookRows.values()].sort(
                  (a, b) => compareId(a.stateId, b.stateId) || compareId(a.commodity, b.commodity)
                ),
              }
            : {}),
        }
      : {}),
  };
}
