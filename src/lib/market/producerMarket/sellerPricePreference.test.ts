import { describe, expect, it } from "vitest";
import {
  producerTrades,
  settleProducerMarket,
  type ProducerOffer,
  type PurchaseOrder,
} from "./rules";
import { SELLER_PRICE_PREFERENCE_EXPONENT } from "@/lib/constants/sellerPricePreference";

const curve = { priceSensitivity: SELLER_PRICE_PREFERENCE_EXPONENT, preferenceByAccount: {} };

const offer = (
  id: string,
  unitPrice: number,
  units: number,
  extra: Partial<ProducerOffer> = {}
): ProducerOffer => ({
  id,
  accountId: `seller-${id}`,
  commodity: "software",
  book: "world",
  units,
  unitPrice,
  countryId: "US",
  ...extra,
});
const order = (id: string, units: number, extra: Partial<PurchaseOrder> = {}): PurchaseOrder => ({
  id,
  accountId: `buyer-${id}`,
  commodity: "software",
  book: "world",
  units,
  maximumUnitPrice: 10_000,
  countryId: "US",
  ...extra,
});
const settle = (
  offers: ProducerOffer[],
  orders: PurchaseOrder[],
  withCurve = true,
  cash: Record<string, number> = {}
) => {
  const ids = new Set([...offers.map((o) => o.accountId), ...orders.map((o) => o.accountId)]);
  return settleProducerMarket({
    turn: 1,
    trackCountryBooks: true,
    accounts: [...ids].sort().map((id) => ({ id, cash: cash[id] ?? 1e9 })),
    offers,
    orders,
    ...(withCurve ? { demandCurve: curve } : {}),
  });
};
type Result = ReturnType<typeof settle>;
const soldOf = (result: Result) => new Map(result.offers.map((o) => [o.id, o.soldUnits]));

function expectConserved(result: Result, offers: ProducerOffer[], orders: PurchaseOrder[]) {
  const sold = result.offers.reduce((n, o) => n + o.soldUnits, 0);
  const internal = result.offers.reduce((n, o) => n + o.internalDeliveredUnits, 0);
  const bought = result.orders.reduce((n, o) => n + o.deliveredUnits, 0);
  expect(sold + internal).toBeCloseTo(bought, 6);
  const revenue = result.offers.reduce((n, o) => n + o.revenue, 0);
  const cost = result.orders.reduce((n, o) => n + o.cost, 0);
  expect(revenue).toBeCloseTo(cost, 4);
  for (const o of result.offers) {
    const posted = offers.find((x) => x.id === o.id)!;
    expect(o.soldUnits).toBeLessThanOrEqual(posted.units + 1e-9);
    // Each seller is paid its own ask.
    if (o.soldUnits > 0) expect(o.revenue / o.soldUnits).toBeCloseTo(posted.unitPrice, 6);
  }
  const ids = new Set([...offers.map((o) => o.accountId), ...orders.map((o) => o.accountId)]);
  const closing = result.accounts.reduce((n, a) => n + a.cash, 0);
  expect(closing).toBeCloseTo(ids.size * 1e9, 0);
  // The receipt replays to the same sellers, units and money.
  const replay = new Map<string, { units: number; amount: number }>();
  for (const trade of producerTrades(result.tradeReceipt)) {
    if (trade.kind !== "sale") continue;
    const row = replay.get(trade.offerId) ?? { units: 0, amount: 0 };
    row.units += trade.units;
    row.amount += trade.amount;
    replay.set(trade.offerId, row);
  }
  for (const o of result.offers) {
    expect(replay.get(o.id)?.units ?? 0).toBeCloseTo(o.soldUnits, 6);
    expect(replay.get(o.id)?.amount ?? 0).toBeCloseTo(o.revenue, 3);
  }
}

describe("soft price preference", () => {
  it("documents the curve: half the per-unit draw at 10% above the cheapest", () => {
    const draw = (gap: number) => Math.pow(1 / (1 + gap), SELLER_PRICE_PREFERENCE_EXPONENT);
    expect(draw(0.1)).toBeGreaterThan(0.45);
    expect(draw(0.1)).toBeLessThan(0.55);
    expect(draw(0.3)).toBeLessThan(0.2);
    expect(draw(0.4)).toBeLessThan(0.1);
  });

  const offers = [offer("cheap", 1000, 100), offer("near", 1050, 100), offer("far", 1400, 100)];

  it("the cheapest seller still sells the most", () => {
    const result = settle(offers, [order("o", 150)]);
    const sold = soldOf(result);
    expect(sold.get("cheap")!).toBeGreaterThan(sold.get("near")!);
    expect(sold.get("near")!).toBeGreaterThan(sold.get("far")!);
    expect(result.orders[0].deliveredUnits).toBeCloseTo(150, 6);
    expectConserved(result, offers, [order("o", 150)]);
  });

  it("a seller 5% above the cheapest gets a solid share", () => {
    const sold = soldOf(settle(offers, [order("o", 150)]));
    expect(sold.get("near")! / sold.get("cheap")!).toBeCloseTo(Math.pow(1 / 1.05, 7), 6);
    expect(sold.get("near")! / 150).toBeGreaterThan(0.35);
  });

  it("a seller 40% above the cheapest gets almost nothing", () => {
    const sold = soldOf(settle(offers, [order("o", 150)]));
    expect(sold.get("far")! / 150).toBeLessThan(0.06);
    expect(sold.get("far")!).toBeGreaterThan(0);
  });

  it("today: the cheapest takes every sale it can cover", () => {
    const sold = soldOf(settle(offers, [order("o", 150)], false));
    expect(sold.get("cheap")!).toBeCloseTo(100, 9);
    expect(sold.get("near")!).toBeCloseTo(50, 9);
    expect(sold.get("far")!).toBe(0);
  });

  it("never fills a buyer above its price limit", () => {
    const orders = [order("o", 250, { maximumUnitPrice: 1100 })];
    const result = settle(offers, orders);
    expect(soldOf(result).get("far")!).toBe(0);
    for (const fill of result.tradeReceipt.fills) expect(fill.unitPrice).toBeLessThanOrEqual(1100);
    expect(result.orders[0].deliveredUnits).toBeCloseTo(200, 6);
    expectConserved(result, offers, orders);
  });

  it("never spends past a buyer's budget or cash", () => {
    const limited = [order("o", 250, { maximumSpend: 120_000 })];
    const spend = settle(offers, limited);
    expect(spend.orders[0].cost).toBeLessThanOrEqual(120_000);
    expect(spend.orders[0].cost).toBeGreaterThan(119_000);
    const poor = [order("p", 250)];
    const cash = settle(offers, poor, true, { "buyer-p": 50_000 });
    expect(cash.orders[0].cost).toBeLessThanOrEqual(50_000);
    expect(cash.accounts.find((a) => a.id === "buyer-p")!.cash).toBeGreaterThanOrEqual(0);
  });

  it("a capped offer sells all it has and the rest is spread over the others", () => {
    const small = [offer("tiny", 900, 5), ...offers];
    const result = settle(small, [order("o", 150)]);
    const sold = soldOf(result);
    expect(sold.get("tiny")!).toBeCloseTo(5, 9);
    expect(result.orders[0].deliveredUnits).toBeCloseTo(150, 6);
    // The others keep their relative weights.
    expect(sold.get("near")! / sold.get("cheap")!).toBeCloseTo(Math.pow(1 / 1.05, 7), 6);
    expectConserved(result, small, [order("o", 150)]);
  });

  it("takes every unit within the limit when demand exceeds supply", () => {
    const result = settle(offers, [order("o", 1000)]);
    for (const o of result.offers) expect(o.soldUnits).toBeCloseTo(100, 9);
  });

  it("matches today's pro rata exactly when every seller asks one price", () => {
    const flat = [offer("a", 1000, 300), offer("b", 1000, 100), offer("c", 1000, 50)];
    const orders = [
      order("x", 200),
      order("y", 90, { fairShare: true }),
      order("z", 40, { fairShare: true }),
    ];
    expect(JSON.stringify(settle(flat, orders, true))).toBe(
      JSON.stringify(settle(flat, orders, false))
    );
  });

  it("is deterministic and does not depend on input order", () => {
    const orders = [order("x", 120), order("y", 60)];
    const first = settle(offers, orders);
    expect(JSON.stringify(settle(offers, orders))).toBe(JSON.stringify(first));
    const shuffled = settle([...offers].reverse(), [...orders].reverse());
    const a = soldOf(first);
    for (const [id, units] of soldOf(shuffled)) expect(units).toBeCloseTo(a.get(id)!, 9);
  });

  it("keeps own sites first, then the buyer's country, then the world", () => {
    const tiered = [
      offer("own", 1300, 30, { accountId: "buyer-o" }),
      offer("home", 1200, 100),
      offer("home-dear", 1260, 100),
      offer("abroad", 800, 1000, { countryId: "JP" }),
    ];
    const orders = [order("o", 150, { homeCountryFirst: true })];
    const result = settleProducerMarket({
      turn: 1,
      ownSitesFirst: true,
      accounts: [...new Set([...tiered.map((o) => o.accountId), "buyer-o"])].map((id) => ({
        id,
        cash: 1e9,
      })),
      offers: tiered,
      orders,
      demandCurve: curve,
    });
    const own = result.offers.find((o) => o.id === "own")!;
    expect(own.internalDeliveredUnits).toBeCloseTo(30, 9);
    const sold = soldOf(result);
    // The home country covers the remaining 120 before any import, by preference.
    expect(sold.get("abroad")!).toBe(0);
    expect(sold.get("home")! + sold.get("home-dear")!).toBeCloseTo(120, 6);
    expect(sold.get("home-dear")! / sold.get("home")!).toBeCloseTo(Math.pow(1200 / 1260, 7), 6);
  });

  it("splits a routed fair-share group by preference and respects each buyer's routes", () => {
    const routedOffers = [
      offer("cheap", 1000, 100),
      offer("near", 1080, 100),
      offer("embargoed", 900, 100, { countryId: "RU" }),
    ];
    const orders = [
      order("a", 80, { fairShare: true, eligibleOfferIds: ["cheap", "near"] }),
      order("b", 40, { fairShare: true }),
    ];
    const result = settle(routedOffers, orders);
    const sold = soldOf(result);
    expect(sold.get("near")!).toBeGreaterThan(0);
    expect(sold.get("cheap")!).toBeGreaterThan(sold.get("near")!);
    const delivered = new Map(result.orders.map((o) => [o.id, o.deliveredUnits]));
    expect(delivered.get("a")!).toBeCloseTo(80, 6);
    expect(delivered.get("b")!).toBeCloseTo(40, 6);
    for (const trade of producerTrades(result.tradeReceipt))
      if (trade.orderId === "a") expect(trade.offerId).not.toBe("embargoed");
    expectConserved(result, routedOffers, orders);
    // With the curve off the cheapest reachable level clears first.
    const off = soldOf(settle(routedOffers, orders, false));
    expect(off.get("near")!).toBe(0);
  });

  it("keeps pooled fills compact: price-only preference names no supplier lists", () => {
    const result = settle(offers, [
      order("x", 120),
      order("y", 60, { fairShare: true }),
      order("z", 30, { fairShare: true }),
    ]);
    expect(result.tradeReceipt.fills.every((f) => f.supplierOfferIds == null)).toBe(true);
  });
});
