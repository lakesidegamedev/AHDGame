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
  /** Set for producer input orders only: the buyer's own offers stay eligible. */
  accountId?: string;
}

export interface RouteOffer {
  id: string;
  commodity: string;
  sellerCountry: string;
  /** Owning account; lets a producer's own sites stay eligible when a route is closed. */
  accountId?: string;
}

/** True when goods of `commodity` may move from `exporter` to `importer`. */
export type RouteOpen = (commodity: string, exporter: string, importer: string) => boolean;

/**
 * Eligible offer ids per order whose route set is restricted. Orders that share
 * a commodity and buyer country share one list, so the cost is per (commodity,
 * country), not per order. An order every seller can reach is omitted.
 */
export function routeEligibility(
  orders: readonly RouteOrder[],
  offers: readonly RouteOffer[],
  open: RouteOpen
): Record<string, readonly string[]> {
  const listFor = createRouteEligibility(offers, open);
  const out: Record<string, readonly string[]> = {};
  for (const order of orders) {
    const list = listFor(order.commodity, order.buyerCountry, order.accountId);
    if (list) out[order.id] = list;
  }
  return out;
}

/** One immutable offer index and route cache for every buyer in a prepared turn. */
export function createRouteEligibility(offers: readonly RouteOffer[], open: RouteOpen) {
  const grouped = new Map<string, Map<string, string[]>>();
  for (const offer of offers) {
    let countries = grouped.get(offer.commodity);
    if (!countries) grouped.set(offer.commodity, (countries = new Map()));
    let ids = countries.get(offer.sellerCountry);
    if (!ids) countries.set(offer.sellerCountry, (ids = []));
    ids.push(offer.id);
  }
  const own = new Map<string, string[]>();
  for (const offer of offers) {
    if (!offer.accountId) continue;
    const key = `${offer.accountId}|${offer.commodity}`;
    const ids = own.get(key);
    if (ids) ids.push(offer.id);
    else own.set(key, [offer.id]);
  }
  const sorted = new Map(
    [...grouped].map(([commodity, countries]) => [
      commodity,
      [...countries].sort(([a], [b]) => (a < b ? -1 : 1)),
    ])
  );
  // undefined means unrestricted; an empty array means no reachable sellers.
  const cache = new Map<string, readonly string[] | undefined>();
  // A producer's own sites are exempt from embargoes (owner decision 2026-11-10): a
  // restricted list also holds the buyer account's own offers of that commodity.
  return (
    commodity: string,
    buyerCountry: string,
    buyerAccountId?: string
  ): readonly string[] | undefined => {
    const key = `${commodity}|${buyerCountry}|${buyerAccountId ?? ""}`;
    if (cache.has(key)) return cache.get(key);
    const ids: string[] = [];
    let closed = false;
    for (const [seller, offerIds] of sorted.get(commodity) ?? []) {
      if (seller === buyerCountry || open(commodity, seller, buyerCountry)) {
        for (const id of offerIds) ids.push(id);
      } else closed = true;
    }
    if (closed && buyerAccountId) {
      const have = new Set(ids);
      for (const id of own.get(`${buyerAccountId}|${commodity}`) ?? [])
        if (!have.has(id)) ids.push(id);
    }
    const list = closed ? ids : undefined;
    cache.set(key, list);
    return list;
  };
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
