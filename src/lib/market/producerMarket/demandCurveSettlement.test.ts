import { describe, expect, it } from "vitest";
import {
  producerTrades,
  settleProducerMarket,
  type ProducerOffer,
  type PurchaseOrder,
} from "./rules";
import { DEMAND_CURVE_PRICE_SENSITIVITY, sellerPreferenceFactor } from "./demandCurveRules";

const offer = (
  id: string,
  accountId: string,
  unitPrice: number,
  units: number,
  extra: Partial<ProducerOffer> = {}
): ProducerOffer => ({
  id,
  accountId,
  commodity: "electronics",
  book: "world",
  units,
  unitPrice,
  countryId: "US",
  ...extra,
});

const offers = [
  offer("o1", "cheap-a", 395, 700),
  offer("o2", "cheap-b", 395, 300),
  offer("o3", "dear-a", 494, 400),
  offer("o4", "dear-b", 494, 300),
  offer("o5", "far", 380, 500, { countryId: "JP" }),
];
const orders: PurchaseOrder[] = [
  {
    id: "households:US",
    accountId: "buyer",
    commodity: "electronics",
    book: "world",
    units: 900,
    maximumUnitPrice: 1000,
    maximumSpend: 1e9,
    countryId: "US",
    homeCountryFirst: true,
  },
];
const accounts = ["buyer", "cheap-a", "cheap-b", "dear-a", "dear-b", "far"].map((id) => ({
  id,
  cash: id === "buyer" ? 1e9 : 0,
}));
const curve = {
  priceSensitivity: DEMAND_CURVE_PRICE_SENSITIVITY,
  preferenceByAccount: {
    "cheap-a": sellerPreferenceFactor(85, 77),
    "cheap-b": sellerPreferenceFactor(99, 85),
    "dear-a": sellerPreferenceFactor(60, 55),
    "dear-b": sellerPreferenceFactor(30, 40),
  },
};
const run = (withCurve: boolean, maximumSpend = 1e9) =>
  settleProducerMarket({
    turn: 1,
    trackCountryBooks: true,
    accounts,
    offers,
    orders: orders.map((o) => ({ ...o, maximumSpend })),
    ...(withCurve ? { demandCurve: curve } : {}),
  });

describe("seller preference curve in settlement", () => {
  it("lets dearer sellers sell and conserves money and units", () => {
    const result = run(true);
    const sold = new Map(result.offers.map((o) => [o.id, o.soldUnits]));
    expect(sold.get("o3")!).toBeGreaterThan(0);
    expect(sold.get("o4")!).toBeGreaterThan(0);
    expect(sold.get("o5")!).toBeCloseTo(0, 6);
    const buyer = result.orders[0];
    expect(buyer.deliveredUnits).toBeCloseTo(900, 6);
    const revenue = result.offers.reduce((n, o) => n + o.revenue, 0);
    expect(revenue).toBeCloseTo(buyer.cost, 6);
    for (const o of result.offers) expect(o.soldUnits).toBeLessThanOrEqual(o.offeredUnits + 1e-9);
    const cash = Object.fromEntries(result.accounts.map((a) => [a.id, a.cash]));
    expect(1e9 - cash.buyer).toBeCloseTo(buyer.cost, 4);
  });

  it("replays the receipt to the same sellers and units", () => {
    const result = run(true);
    const replay = new Map<string, { units: number; amount: number }>();
    for (const trade of producerTrades(result.tradeReceipt)) {
      const row = replay.get(trade.offerId) ?? { units: 0, amount: 0 };
      row.units += trade.units;
      row.amount += trade.amount;
      replay.set(trade.offerId, row);
    }
    for (const o of result.offers) {
      expect(replay.get(o.id)?.units ?? 0).toBeCloseTo(o.soldUnits, 6);
      expect(replay.get(o.id)?.amount ?? 0).toBeCloseTo(o.revenue, 4);
    }
  });

  it("keeps the buyer's spending limit", () => {
    const result = run(true, 200_000);
    expect(result.orders[0].cost).toBeLessThanOrEqual(200_000 + 1e-6);
    expect(result.orders[0].cost).toBeGreaterThan(190_000);
  });

  it("is byte-identical to today with the curve absent", () => {
    const off = run(false);
    expect(off.offers.find((o) => o.id === "o3")!.soldUnits).toBe(0);
    expect(JSON.stringify(run(false))).toBe(JSON.stringify(off));
    expect(off.tradeReceipt.fills.every((f) => f.supplierOfferIds == null)).toBe(true);
  });

  describe("ordinary pooled pass", () => {
    const householdOrder = (
      id: string,
      units: number,
      extra: Partial<PurchaseOrder> = {}
    ): PurchaseOrder => ({
      id,
      accountId: "buyer",
      commodity: "electronics",
      book: "world",
      units,
      maximumUnitPrice: 1000,
      maximumSpend: 1e9,
      countryId: "US",
      ...extra,
    });
    const runOrders = (withCurve: boolean, list: PurchaseOrder[]) =>
      settleProducerMarket({
        turn: 1,
        trackCountryBooks: true,
        accounts: [...accounts, { id: "buyer2", cash: 1e9 }],
        offers,
        orders: list,
        ...(withCurve ? { demandCurve: curve } : {}),
      });
    const replayUnits = (result: ReturnType<typeof runOrders>) => {
      const replay = new Map<string, number>();
      for (const trade of producerTrades(result.tradeReceipt))
        replay.set(trade.offerId, (replay.get(trade.offerId) ?? 0) + trade.units);
      return replay;
    };

    it("applies the curve to a free-choice order without home-country-first", () => {
      const list = [householdOrder("households:US", 900)];
      const result = runOrders(true, list);
      const sold = new Map(result.offers.map((o) => [o.id, o.soldUnits]));
      expect(sold.get("o3")!).toBeGreaterThan(0);
      expect(sold.get("o5")!).toBeGreaterThan(0);
      expect(result.orders[0].deliveredUnits).toBeCloseTo(900, 6);
      const revenue = result.offers.reduce((n, o) => n + o.revenue, 0);
      expect(revenue).toBeCloseTo(result.orders[0].cost, 6);
      for (const o of result.offers) expect(o.soldUnits).toBeLessThanOrEqual(o.offeredUnits + 1e-9);
      const replay = replayUnits(result);
      for (const o of result.offers) expect(replay.get(o.id) ?? 0).toBeCloseTo(o.soldUnits, 6);
      // Brand splits a price level into named subsets; a whole level stays pooled.
      expect(result.tradeReceipt.fills.some((f) => f.supplierOfferIds != null)).toBe(true);
      expect(result.tradeReceipt.fills.some((f) => f.supplierOfferIds == null)).toBe(true);
    });

    it("leaves the same order cheapest-first with the curve off", () => {
      const result = runOrders(false, [householdOrder("households:US", 900)]);
      expect(result.offers.find((o) => o.id === "o3")!.soldUnits).toBe(0);
      expect(result.tradeReceipt.fills.every((f) => f.supplierOfferIds == null)).toBe(true);
    });

    it("splits a fair-share group by the curve and conserves units and money", () => {
      const list = [
        householdOrder("a", 600, { fairShare: true }),
        householdOrder("b", 300, { fairShare: true, accountId: "buyer2" }),
      ];
      const result = runOrders(true, list);
      const sold = new Map(result.offers.map((o) => [o.id, o.soldUnits]));
      expect(sold.get("o3")!).toBeGreaterThan(0);
      const delivered = result.orders.reduce((n, o) => n + o.deliveredUnits, 0);
      expect(delivered).toBeCloseTo(900, 5);
      const byId = new Map(result.orders.map((o) => [o.id, o.deliveredUnits]));
      expect(byId.get("a")! / byId.get("b")!).toBeCloseTo(2, 4);
      expect(result.offers.reduce((n, o) => n + o.revenue, 0)).toBeCloseTo(
        result.orders.reduce((n, o) => n + o.cost, 0),
        4
      );
      for (const o of result.offers) expect(o.soldUnits).toBeLessThanOrEqual(o.offeredUnits + 1e-9);
      const replay = replayUnits(result);
      for (const o of result.offers) expect(replay.get(o.id) ?? 0).toBeCloseTo(o.soldUnits, 5);
    });

    it("keeps a fair-share group cheapest-first with the curve off", () => {
      const list = [
        householdOrder("a", 600, { fairShare: true }),
        householdOrder("b", 300, { fairShare: true, accountId: "buyer2" }),
      ];
      const result = runOrders(false, list);
      expect(result.offers.find((o) => o.id === "o3")!.soldUnits).toBe(0);
    });
  });
});
