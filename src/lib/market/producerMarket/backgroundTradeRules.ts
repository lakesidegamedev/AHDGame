/**
 * Background countries in the funded producer market (#5702).
 *
 * A background country runs no plants and seats no households, so on a funded
 * turn it would otherwise place no orders and post no offers, and the price
 * phase (which rebuilds every ledger from the settled market) would lose it.
 * Here its macro economy becomes one trading account per country:
 *
 * - Offers: the traded share of its macro supply (the kernel's contribution,
 *   already scaled by trade exposure) posted at the reference price.
 * - Orders: the traded share of its macro demand, bid like a public buyer:
 *   spend at the reference price, a price ceiling with the same headroom, so
 *   it buys fewer units when prices rise.
 * - Only goods that cross borders trade: local services and the per-country
 *   service books (freight, construction) stay out, as they do for every
 *   other foreign buyer.
 * - Routes: its orders may take any seller the trade matrix lets reach it and
 *   never its own offers (its domestic trade is not in the exposed share).
 *   Other buyers reach its offers through the same route rule.
 *
 * Pure: macro contributions and prices in, offers, orders and per-country
 * trade outcomes out.
 */
import { COMMODITY_TYPES, type CommodityType } from "@/lib/constants/commodities";
import { commodityMarketScope } from "@/lib/market/rules/commodityMarketScope";
import type { ProducerOffer, PurchaseOrder } from "./rules";
import type { RouteOpen } from "./routeRules";

export interface BackgroundEconomy {
  countryId: string;
  /** The country's producer-market wallet id. */
  accountId: string;
  /** Macro contribution on the price phase's basis (see `unitsPerTurnDivisor`). */
  byCommodity: Partial<Record<string, { supply: number; demand: number }>>;
}

/** Offer id of a background country's supply of one good. */
export function backgroundOfferId(countryId: string, commodity: string): string {
  return JSON.stringify(["background", countryId, "offer", commodity]);
}

/** Order id of a background country's demand for one good. */
export function backgroundOrderId(countryId: string, commodity: string): string {
  return JSON.stringify(["background", countryId, "order", commodity]);
}

/** True for goods that trade across borders on the world book. */
export function isBackgroundTradable(commodity: string): boolean {
  return (
    (COMMODITY_TYPES as readonly string[]).includes(commodity) &&
    commodityMarketScope(commodity as CommodityType) === "reachable"
  );
}

/**
 * Offers and orders for every background country, in country then commodity
 * order. `unitsPerTurnDivisor` converts the price phase's basis to settlement
 * units per turn (the inverse of the funded ledger's unit scale), so a fully
 * offered and fully requested turn puts the same units back in the price
 * phase's books as the modelled path did.
 */
export function backgroundTradeLines(input: {
  economies: readonly BackgroundEconomy[];
  referencePrice: (commodity: string) => number | null;
  priceHeadroom: number;
  unitsPerTurnDivisor: number;
}): { offers: ProducerOffer[]; orders: PurchaseOrder[] } {
  if (!(input.unitsPerTurnDivisor > 0) || !(input.priceHeadroom >= 1))
    throw new Error("Invalid background trade scale");
  const offers: ProducerOffer[] = [];
  const orders: PurchaseOrder[] = [];
  for (const economy of [...input.economies].sort((a, b) =>
    a.countryId < b.countryId ? -1 : a.countryId > b.countryId ? 1 : 0
  )) {
    for (const commodity of Object.keys(economy.byCommodity).sort()) {
      if (!isBackgroundTradable(commodity)) continue;
      const price = input.referencePrice(commodity);
      if (price == null || !Number.isFinite(price) || !(price > 0)) continue;
      const bal = economy.byCommodity[commodity]!;
      const supply = Number.isFinite(bal.supply) ? bal.supply / input.unitsPerTurnDivisor : 0;
      const demand = Number.isFinite(bal.demand) ? bal.demand / input.unitsPerTurnDivisor : 0;
      if (supply > 0)
        offers.push({
          id: backgroundOfferId(economy.countryId, commodity),
          accountId: economy.accountId,
          commodity,
          book: "world",
          units: supply,
          unitPrice: price,
          countryId: economy.countryId,
        });
      if (demand > 0)
        orders.push({
          id: backgroundOrderId(economy.countryId, commodity),
          accountId: economy.accountId,
          commodity,
          book: "world",
          units: demand,
          maximumUnitPrice: price * input.priceHeadroom,
          maximumSpend: demand * price,
          countryId: economy.countryId,
        });
    }
  }
  return { offers, orders };
}

/** Anchor funding each background wallet needs this turn: its orders' spend limits. */
export function backgroundFundingByAccount(orders: readonly PurchaseOrder[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const o of orders)
    if ((o.maximumSpend ?? 0) > 0)
      out.set(o.accountId, (out.get(o.accountId) ?? 0) + o.maximumSpend!);
  return out;
}

/**
 * Eligible sellers for each background order: every world offer of the good
 * from another country whose route is open (`open` null: no route matrix this
 * turn, every other country is reachable). A background country never buys
 * its own offer.
 */
export function backgroundOrderEligibility(
  orders: readonly PurchaseOrder[],
  offers: readonly { id: string; commodity: string; sellerCountry: string }[],
  open: RouteOpen | null
): Map<string, readonly string[]> {
  const byCommodity = new Map<string, { id: string; sellerCountry: string }[]>();
  for (const o of offers) {
    const rows = byCommodity.get(o.commodity) ?? [];
    rows.push(o);
    byCommodity.set(o.commodity, rows);
  }
  const cache = new Map<string, readonly string[]>();
  const out = new Map<string, readonly string[]>();
  for (const order of orders) {
    const buyer = order.countryId ?? "";
    const key = `${order.commodity}|${buyer}`;
    let list = cache.get(key);
    if (!list) {
      list = (byCommodity.get(order.commodity) ?? [])
        .filter(
          (o) =>
            o.sellerCountry !== buyer &&
            (open == null || open(order.commodity, o.sellerCountry, buyer))
        )
        .map((o) => o.id)
        .sort();
      cache.set(key, list);
    }
    out.set(order.id, list);
  }
  return out;
}

export interface BackgroundTradeOutcome {
  /** Anchor value of the supply offered at its posted prices. */
  offeredValue: number;
  /** Anchor value actually sold. */
  soldValue: number;
  /** Anchor value of the demand at reference prices (the orders' spend limits). */
  requestedValue: number;
  /** Anchor value actually bought. */
  boughtValue: number;
}

/**
 * What each background country sold and bought this turn. Its wallet opened
 * with exactly its funding and only these offers and orders move it, so what
 * it sold is its closing cash less what it had left of the funding:
 * sold = closing - (opening - bought).
 */
export function backgroundTradeOutcomes(input: {
  economies: readonly Pick<BackgroundEconomy, "countryId" | "accountId">[];
  offers: readonly ProducerOffer[];
  orders: readonly PurchaseOrder[];
  openingCash: ReadonlyMap<string, number>;
  closingCash: ReadonlyMap<string, number>;
  /** Settled spend per fill (producerFillSpend). */
  fills: readonly { buyerAccountId: string; amount: number }[];
}): Map<string, BackgroundTradeOutcome> {
  const out = new Map<string, BackgroundTradeOutcome>();
  const byAccount = new Map<string, BackgroundTradeOutcome>();
  for (const e of input.economies) {
    const row = { offeredValue: 0, soldValue: 0, requestedValue: 0, boughtValue: 0 };
    out.set(e.countryId, row);
    byAccount.set(e.accountId, row);
  }
  for (const o of input.offers) {
    const row = byAccount.get(o.accountId);
    if (row) row.offeredValue += o.units * o.unitPrice;
  }
  for (const o of input.orders) {
    const row = byAccount.get(o.accountId);
    if (row) row.requestedValue += o.maximumSpend ?? 0;
  }
  for (const f of input.fills) {
    const row = byAccount.get(f.buyerAccountId);
    if (row && f.amount > 0) row.boughtValue += f.amount;
  }
  for (const [accountId, row] of byAccount) {
    const opening = input.openingCash.get(accountId) ?? 0;
    const closing = input.closingCash.get(accountId) ?? 0;
    const sold = closing - (opening - row.boughtValue);
    // Float residue only: a sale can never exceed what was offered.
    row.soldValue = Math.min(row.offeredValue, Math.max(0, sold));
  }
  return out;
}
