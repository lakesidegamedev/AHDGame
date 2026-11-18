import { describe, it, expect } from "vitest";
import { settleProducerMarket, producerTrades } from "@/lib/market/producerMarket/rules";
import type { ElectricityNetwork } from "./types";
import { createGridLedger } from "./paths";
const grid: ElectricityNetwork = {
  mode: "enforced",
  version: "test",
  year: 2027,
  notes: [],
  links: [
    { id: "tie", from: "US", to: "CA", capacity: 10, loss: 0.1, name: "Test tie", source: "test" },
  ],
};
const offer = (id: string, accountId = id, countryId = "US") => ({
  id,
  accountId,
  countryId,
  commodity: "energy",
  book: "world",
  units: 100,
  unitPrice: 9,
});
const order = (id: string, countryId = "CA") => ({
  id,
  accountId: id,
  countryId,
  commodity: "energy",
  book: "world",
  units: 10,
  maximumUnitPrice: 10,
  fairShare: true,
});
function clear(extra: Partial<Parameters<typeof settleProducerMarket>[0]> = {}) {
  return settleProducerMarket({
    turn: 1,
    accounts: [
      { id: "s", cash: 0 },
      { id: "b", cash: 100 },
      { id: "c", cash: 100 },
    ],
    offers: [offer("s")],
    orders: [order("b"), order("c")],
    electricityNetwork: grid,
    ...extra,
  });
}
describe("physical electricity clearing", () => {
  it("shares a link and charges for dispatched energy while delivering after losses", () => {
    const r = clear();
    expect(r.orders.map((o) => o.deliveredUnits)).toEqual([4.5, 4.5]);
    expect(r.offers[0]).toMatchObject({ soldUnits: 10, deliveredUnits: 10, revenue: 90 });
    expect(r.accounts.reduce((s, a) => s + a.cash, 0)).toBeCloseTo(200);
    expect(r.electricity).toMatchObject({ dispatched: 10, delivered: 9, losses: 1 });
    const trades = [...producerTrades(r.tradeReceipt)];
    expect(trades).toHaveLength(r.tradeReceipt.tradeCount);
    expect(trades.reduce((s, t) => s + (t.dispatchedUnits ?? t.units), 0)).toBeCloseTo(10);
    expect(trades.reduce((s, t) => s + t.units, 0)).toBeCloseTo(9);
    expect([...producerTrades(r.tradeReceipt, "b")]).toHaveLength(1);
  });
  it("blocks an ocean with no cable, including own-company transfers", () => {
    const r = clear({ offers: [offer("s", "b")], orders: [order("b", "JP")], ownSitesFirst: true });
    expect(r.orders[0].deliveredUnits).toBe(0);
    expect(r.tradeReceipt.tradeCount).toBe(0);
    expect(r.accounts.find((a) => a.id === "b")?.cash).toBe(100);
  });
  it("keeps Off and Shadow settlement byte-for-byte identical to the existing book", () => {
    const base = { offers: [offer("s")], orders: [order("b", "JP")] };
    const off = clear({ ...base, electricityNetwork: undefined });
    expect(clear({ ...base, electricityNetwork: { ...grid, mode: "off" } })).toEqual(off);
    expect(clear({ ...base, electricityNetwork: { ...grid, mode: "shadow" } })).toEqual(off);
    expect(off.orders[0].deliveredUnits).toBe(10);
  });
  it("applies capacity and losses to internal transfers without a cash payment", () => {
    const r = clear({ offers: [offer("s", "b")], orders: [order("b")], ownSitesFirst: true });
    expect(r.orders[0]).toMatchObject({ deliveredUnits: 9, cost: 0 });
    expect(r.accounts.find((a) => a.id === "b")?.cash).toBe(100);
    expect(r.offers[0]).toMatchObject({
      internalDeliveredUnits: 10,
      deliveredUnits: 10,
      revenue: 0,
    });
  });
  it("honors supplier reservations and their delivered-unit contract price", () => {
    const r = clear({ orders: [{ ...order("b"), supplierOfferId: "s", contractUnitPrice: 5 }] });
    expect(r.orders[0]).toMatchObject({ deliveredUnits: 9, cost: 45 });
    expect(r.offers[0].revenue).toBe(45);
  });
  it("does not bypass embargo or supplier filters", () => {
    expect(
      clear({ orders: [{ ...order("b"), eligibleOfferIds: [] }] }).orders[0].deliveredUnits
    ).toBe(0);
  });
  it("respects shared cash, quantity and spend groups", () => {
    const r = clear({
      orders: [
        { ...order("b"), maximumSpend: 20, spendGroup: { id: "g", maximumSpend: 30 } },
        { ...order("c"), accountId: "b", spendGroup: { id: "g", maximumSpend: 30 } },
      ],
    });
    expect(r.orders.reduce((s, o) => s + o.cost, 0)).toBeLessThanOrEqual(30 + 1e-9);
    expect(r.orders[0].cost).toBeLessThanOrEqual(20 + 1e-9);
  });
  it("retains large-balance cash conservation and deterministic retries", () => {
    const input = {
      accounts: [
        { id: "s", cash: 1e12 },
        { id: "b", cash: 1e12 },
        { id: "c", cash: 1e12 },
      ],
    };
    const r = clear(input);
    expect(r.accounts.reduce((s, a) => s + a.cash, 0)).toBeCloseTo(3e12, 2);
    expect(clear(input)).toEqual(r);
  });
  it("never applies electrical constraints to fuel or other goods", () => {
    const r = clear({
      offers: [{ ...offer("s"), commodity: "natural_gas" }],
      orders: [{ ...order("b", "JP"), commodity: "natural_gas" }],
    });
    expect(r.orders[0].deliveredUnits).toBe(10);
  });
  it("releases no capacity across opposite directions or alternate paths", () => {
    const l = createGridLedger(grid);
    const p = l.path({ countryId: "US" }, { countryId: "CA" })!;
    l.take(p, 9);
    expect(l.path({ countryId: "CA" }, { countryId: "US" })).toBeNull();
    expect(l.summary().lines[0].dispatched).toBe(10);
  });
});

describe("grid paths and receipt validation", () => {
  it("routes through an alternate interconnector after the better path fills", () => {
    const links = [
      { id: "direct", from: "US", to: "CA", capacity: 5, loss: 0, name: "direct", source: "test" },
      { id: "a", from: "US", to: "MX", capacity: 10, loss: 0.1, name: "a", source: "test" },
      { id: "b", from: "MX", to: "CA", capacity: 10, loss: 0.1, name: "b", source: "test" },
    ];
    const r = clear({
      electricityNetwork: { ...grid, links },
      accounts: [
        { id: "s", cash: 0 },
        { id: "b", cash: 1000 },
      ],
      orders: [{ ...order("b"), units: 20, maximumUnitPrice: 20 }],
    });
    expect(r.orders[0].deliveredUnits).toBeCloseTo(13.1);
    expect(r.electricity?.losses).toBeCloseTo(1.9);
    const trades = [...producerTrades(r.tradeReceipt)];
    expect(new Set(trades.map((t) => t.id)).size).toBe(trades.length);
    expect([...producerTrades(r.tradeReceipt)]).toEqual(trades);
    expect([...producerTrades(r.tradeReceipt)].reduce((s, t) => s + t.amount, 0)).toBeCloseTo(
      r.offers[0].revenue
    );
  });
  it.each([NaN, Infinity, -1])("rejects corrupt grid receipt prices: %s", (price) => {
    const receipt = structuredClone(clear().tradeReceipt);
    receipt.fills[0].unitPrice = price;
    expect(() => [...producerTrades(receipt)]).toThrow("Invalid electricity receipt");
  });
  it("never replays a supplier outside the eligible book", () => {
    const receipt = structuredClone(clear().tradeReceipt);
    receipt.orders[0].eligibleOfferIds = [];
    expect(() => [...producerTrades(receipt)]).toThrow("Invalid electricity receipt");
  });
});
