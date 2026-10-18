/**
 * Trade routes in the unified producer market (owner decisions 2026-10-18:
 * sales should go to real buyers who can reach them; government distortions
 * are real flows).
 *
 * - Eligibility: a buyer may only buy from sellers in its own country or in a
 *   country it can trade with for that commodity (embargoes, the curtain and
 *   blockades close a route). The answer comes from the same affinity matrix
 *   the trade system uses, so both agree on which routes exist.
 * - Tariffs: each cross-border sale pays the importer's tariff on its value to
 *   the importing country's treasury. Charged after clearing, so a tariff moves
 *   money but does not yet change which seller wins (a delivered-price book is
 *   a later step).
 *
 * Pure: plain data and lookups in, eligibility lists and transfers out.
 */

export interface RouteOrder {
  id: string;
  commodity: string;
  buyerCountry: string;
}

export interface RouteOffer {
  id: string;
  commodity: string;
  sellerCountry: string;
}

/** True when goods of `commodity` may move from `exporter` to `importer`. */
export type RouteOpen = (commodity: string, exporter: string, importer: string) => boolean;

/**
 * Eligible offer ids per order. Orders that share a commodity and buyer country
 * share one list, so the cost is per (commodity, country), not per order.
 */
export function routeEligibility(
  orders: readonly RouteOrder[],
  offers: readonly RouteOffer[],
  open: RouteOpen
): Record<string, readonly string[]> {
  const byCommodityCountry = new Map<string, Map<string, string[]>>();
  for (const o of offers) {
    const byCountry = byCommodityCountry.get(o.commodity) ?? new Map<string, string[]>();
    const ids = byCountry.get(o.sellerCountry) ?? [];
    ids.push(o.id);
    byCountry.set(o.sellerCountry, ids);
    byCommodityCountry.set(o.commodity, byCountry);
  }
  const cache = new Map<string, readonly string[]>();
  const out: Record<string, readonly string[]> = {};
  for (const order of orders) {
    const key = `${order.commodity}|${order.buyerCountry}`;
    let list = cache.get(key);
    if (!list) {
      const ids: string[] = [];
      const byCountry = byCommodityCountry.get(order.commodity);
      for (const [seller, offerIds] of [...(byCountry ?? new Map<string, string[]>())].sort(
        ([a], [b]) => (a < b ? -1 : 1)
      )) {
        if (seller === order.buyerCountry || open(order.commodity, seller, order.buyerCountry))
          ids.push(...offerIds);
      }
      list = ids;
      cache.set(key, list);
    }
    out[order.id] = list;
  }
  return out;
}

export interface CrossBorderTrade {
  buyerAccountId: string;
  buyerCountry: string;
  sellerCountry: string;
  commodity: string;
  /** Units x price, in the market's anchor units. */
  value: number;
}

export interface TariffTransfer {
  fromAccountId: string;
  toAccountId: string;
  amount: number;
  importer: string;
  commodity: string;
}

/**
 * Tariff owed on each cross-border sale, paid by the buyer to the importing
 * treasury. `importCostMultiplier` is the trade system's (1 + tariff rate).
 * One transfer per (buyer, commodity, importer); never more than `cashOf`.
 */
export function tariffTransfers(
  trades: readonly CrossBorderTrade[],
  importCostMultiplier: (commodity: string, exporter: string, importer: string) => number,
  treasuryAccountOf: (country: string) => string | null,
  cashOf: (accountId: string) => number
): TariffTransfer[] {
  const owed = new Map<string, TariffTransfer>();
  for (const t of trades) {
    if (t.sellerCountry === t.buyerCountry || !(t.value > 0)) continue;
    const rate = importCostMultiplier(t.commodity, t.sellerCountry, t.buyerCountry) - 1;
    if (!(rate > 0) || !Number.isFinite(rate)) continue;
    const to = treasuryAccountOf(t.buyerCountry);
    if (!to || to === t.buyerAccountId) continue;
    const key = `${t.buyerAccountId}|${t.commodity}|${t.buyerCountry}`;
    const row = owed.get(key) ?? {
      fromAccountId: t.buyerAccountId,
      toAccountId: to,
      amount: 0,
      importer: t.buyerCountry,
      commodity: t.commodity,
    };
    row.amount += t.value * rate;
    owed.set(key, row);
  }
  const remaining = new Map<string, number>();
  const out: TariffTransfer[] = [];
  for (const row of [...owed.values()].sort((a, b) =>
    a.fromAccountId === b.fromAccountId
      ? a.commodity < b.commodity
        ? -1
        : 1
      : a.fromAccountId < b.fromAccountId
        ? -1
        : 1
  )) {
    const left = remaining.get(row.fromAccountId) ?? Math.max(0, cashOf(row.fromAccountId));
    const amount = Math.min(left, row.amount);
    remaining.set(row.fromAccountId, left - amount);
    if (amount > 0) out.push({ ...row, amount });
  }
  return out;
}
