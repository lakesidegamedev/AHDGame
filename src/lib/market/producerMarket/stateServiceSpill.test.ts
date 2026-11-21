import { describe, expect, it } from "vitest";
import { adjacentStates } from "@/lib/constants/stateAdjacency";
import { producerTrades, settleProducerMarket, type PurchaseOrder } from "./rules";
import { markStateServiceSpill, spillBooksFor } from "./stateServiceSpillRules";

// US: CA borders NV; NY does not border CA.
const BUYER_STATE = "NV";
const NEIGHBOUR = adjacentStates("US", BUYER_STATE)[0];
const FAR = "NY";

const order = (over: Partial<PurchaseOrder> = {}): PurchaseOrder => ({
  id: "hh-1",
  accountId: "buyer",
  commodity: "healthcare_services",
  book: `state:${BUYER_STATE}`,
  units: 100,
  maximumUnitPrice: 50,
  countryId: "US",
  stateId: BUYER_STATE,
  ...over,
});

const offer = (id: string, state: string, units: number, countryId = "US", price = 10) => ({
  id,
  accountId: `seller-${id}`,
  commodity: "healthcare_services",
  book: `state:${state}`,
  units,
  unitPrice: price,
  countryId,
  stateId: state,
});

const settle = (orders: PurchaseOrder[], offers: ReturnType<typeof offer>[]) => {
  const accounts = [
    { id: "buyer", cash: 100_000 },
    { id: "buyer2", cash: 100_000 },
    ...offers.map((o) => ({ id: o.accountId, cash: 0 })),
  ];
  const before = accounts.reduce((n, a) => n + a.cash, 0);
  const result = settleProducerMarket({
    turn: 1,
    accounts,
    offers,
    orders: markStateServiceSpill(orders),
  });
  const after = result.accounts.reduce((n, a) => n + a.cash, 0);
  return { result, before, after };
};

const sold = (r: ReturnType<typeof settle>["result"], id: string) =>
  r.offers.find((o) => o.id === id)!.soldUnits;

describe("healthcare spill to neighbouring states", () => {
  it("flags only state-book healthcare orders with neighbour books", () => {
    expect(spillBooksFor(`state:${BUYER_STATE}`, "US")).toContain(`state:${NEIGHBOUR}`);
    expect(spillBooksFor("world", "US")).toEqual([]);
    const [food] = markStateServiceSpill([order({ commodity: "food" })]);
    expect(food.spillBooks).toBeUndefined();
  });

  it("sells a neighbour hospital's excess into unmet demand and moves money once", () => {
    const { result, before, after } = settle([order()], [offer("h-n", NEIGHBOUR, 60)]);
    expect(sold(result, "h-n")).toBeCloseTo(60);
    expect(result.orders[0].deliveredUnits).toBeCloseTo(60);
    expect(result.orders[0].cost).toBeCloseTo(600);
    expect(result.accounts.find((a) => a.id === "seller-h-n")!.cash).toBeCloseTo(600);
    expect(result.accounts.find((a) => a.id === "buyer")!.cash).toBeCloseTo(100_000 - 600);
    expect(after).toBeCloseTo(before);
    const traded = [...producerTrades(result.tradeReceipt)];
    expect(traded.reduce((n, t) => n + t.amount, 0)).toBeCloseTo(600);
  });

  it("serves the home book first and does not fill the same units twice", () => {
    const { result } = settle(
      [order({ units: 100 })],
      [offer("h-home", BUYER_STATE, 70, "US", 12), offer("h-n", NEIGHBOUR, 100)]
    );
    expect(sold(result, "h-home")).toBeCloseTo(70);
    expect(sold(result, "h-n")).toBeCloseTo(30);
    expect(result.orders[0].deliveredUnits).toBeCloseTo(100);
  });

  it("lets the neighbour's own buyers clear before any spill", () => {
    const { result } = settle(
      [
        order(),
        order({
          id: "hh-n",
          accountId: "buyer2",
          book: `state:${NEIGHBOUR}`,
          units: 50,
          stateId: NEIGHBOUR,
        }),
      ],
      [offer("h-n", NEIGHBOUR, 80)]
    );
    expect(result.orders.find((o) => o.id === "hh-n")!.deliveredUnits).toBeCloseTo(50);
    expect(result.orders.find((o) => o.id === "hh-1")!.deliveredUnits).toBeCloseTo(30);
  });

  it("does not spill into non-adjacent states", () => {
    const { result } = settle([order()], [offer("h-far", FAR, 60)]);
    expect(sold(result, "h-far")).toBe(0);
    expect(result.orders[0].deliveredUnits).toBe(0);
  });

  it("respects country borders", () => {
    const { result } = settle([order()], [offer("h-n", NEIGHBOUR, 60, "CA")]);
    expect(sold(result, "h-n")).toBe(0);
  });

  it("is one hop only", () => {
    const second = adjacentStates("US", NEIGHBOUR).find(
      (s) => s !== BUYER_STATE && !adjacentStates("US", BUYER_STATE).includes(s)
    )!;
    const { result } = settle([order()], [offer("h-2", second, 60)]);
    expect(sold(result, "h-2")).toBe(0);
  });

  it("never pays above the buyer's limit and respects its cash", () => {
    const pricey = settle([order({ maximumUnitPrice: 5 })], [offer("h-n", NEIGHBOUR, 60)]);
    expect(sold(pricey.result, "h-n")).toBe(0);
    const capped = settle([order({ maximumSpend: 250 })], [offer("h-n", NEIGHBOUR, 60)]);
    expect(capped.result.orders[0].cost).toBeCloseTo(250);
  });
});
