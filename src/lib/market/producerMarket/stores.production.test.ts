import { describe, expect, it } from "vitest";
import { advanceProducerEconomy, type ProductionPlan } from "./production";

const farm = (): ProductionPlan => ({
  id: "farm",
  accountId: "farmCorp",
  stateId: "S1",
  capacityUnits: 1000,
  activeFraction: 1,
  outputMultiplier: 1,
  labourCost: 0,
  otherOperatingCost: 0,
  labourRecipientAccountId: "farmWages",
  operatingRecipientAccountId: "farmServices",
  inputs: [],
  outputs: [
    {
      commodity: "food",
      unitsPerOutput: 1,
      book: "world",
      policy: { kind: "manual", unitPrice: 2 },
      referenceUnitPrice: 2,
      storable: false,
    },
  ],
  inputStock: [],
  outputStock: [],
});

const store = (resaleValuePerRunUnit: number): ProductionPlan => ({
  id: "store",
  accountId: "storeCorp",
  stateId: "S1",
  capacityUnits: 10,
  activeFraction: 1,
  outputMultiplier: 1,
  labourCost: 0,
  otherOperatingCost: 0,
  labourRecipientAccountId: "storeWages",
  operatingRecipientAccountId: "storeServices",
  inputs: [],
  outputs: [],
  inputStock: [],
  outputStock: [],
  store: { resaleValuePerRunUnit },
});

const accounts = [
  { id: "farmCorp", cash: 0 },
  { id: "farmWages", cash: 0 },
  { id: "farmServices", cash: 0 },
  { id: "storeCorp", cash: 0 },
  { id: "storeWages", cash: 0 },
  { id: "storeServices", cash: 0 },
  { id: "hh", cash: 1000 },
];

const household = {
  accountId: "hh",
  stateId: "S1",
  spendFraction: 1,
  products: [{ commodity: "food", book: "world", maximumUnitPrice: 4, weight: 1 }],
};

const cashOf = (result: ReturnType<typeof advanceProducerEconomy>, id: string) =>
  result.accounts.find((a) => a.id === id)!.cash;

describe("stores resell household purchases at wholesale plus a markup", () => {
  it("producers get the wholesale price, the store keeps the markup, the household pays both", () => {
    const result = advanceProducerEconomy({
      turn: 1,
      accounts,
      producers: [farm(), store(10_000)],
      households: [household],
      storeMarkup: 0.15,
    });
    const sales = result.storeSales!;
    // 60% of food goes through stores, the rest buys direct.
    const channel = sales.channels.find((c) => c.commodity === "food")!;
    expect(channel.storeValue).toBeGreaterThan(0);
    expect(channel.directValue).toBeGreaterThan(0);
    // What households pay through stores, markup included, is 60% of the food spend.
    expect(
      (channel.storeValue * 1.15) / (channel.storeValue * 1.15 + channel.directValue)
    ).toBeCloseTo(0.6, 6);
    const markup = sales.stores[0].markupEarned;
    expect(markup).toBeCloseTo(channel.storeValue * 0.15, 6);
    // The farm is paid the wholesale price for everything households bought.
    expect(cashOf(result, "farmCorp")).toBeCloseTo(channel.storeValue + channel.directValue, 6);
    expect(cashOf(result, "storeCorp")).toBeCloseTo(markup, 6);
    expect(cashOf(result, "hh")).toBeCloseTo(
      1000 - channel.storeValue - channel.directValue - markup,
      6
    );
    expect(cashOf(result, "hh")).toBeGreaterThanOrEqual(0);
    // The store's own result carries the same rows, and they add up.
    const store1 = result.producers.find((p) => p.id === "store")!;
    expect(store1.store!.markupEarned).toBeCloseTo(markup, 6);
    expect(store1.store!.goodsBoughtWholesale).toBeCloseTo(channel.storeValue, 6);
    expect(store1.revenue).toBeCloseTo(markup, 6);
  });

  it("buys direct from producers at the producer price when a state has no store", () => {
    const result = advanceProducerEconomy({
      turn: 1,
      accounts,
      producers: [farm()],
      households: [household],
      storeMarkup: 0.15,
    });
    const channel = result.storeSales!.channels.find((c) => c.commodity === "food")!;
    expect(channel.storeValue).toBe(0);
    expect(channel.directValue).toBeGreaterThan(0);
    // Nothing is stranded: the farm sells the whole household budget, no markup is charged.
    expect(cashOf(result, "farmCorp")).toBeCloseTo(channel.directValue, 6);
    expect(result.storeSales!.transfers).toEqual([]);
  });

  it("sends the share a small store cannot serve direct, and charges markup only on the served part", () => {
    // Room for a tenth of the routed demand (60% of 1000 = 600 of spend).
    const result = advanceProducerEconomy({
      turn: 1,
      accounts,
      producers: [farm(), store(6)],
      households: [household],
      storeMarkup: 0.15,
    });
    const state = result.storeSales!.coverageByState.S1;
    expect(state.coverage).toBeLessThan(1);
    expect(state.coverage).toBeGreaterThan(0);
    const channel = result.storeSales!.channels.find((c) => c.commodity === "food")!;
    // Households never pay stores more than the stores can resell.
    expect(channel.storeValue * 1.15).toBeLessThanOrEqual(state.capacityValue + 1e-9);
    expect(channel.storeValue).toBeGreaterThan(0);
    expect(cashOf(result, "farmCorp")).toBeCloseTo(channel.storeValue + channel.directValue, 6);
    expect(cashOf(result, "storeCorp")).toBeCloseTo(channel.storeValue * 0.15, 6);
  });

  it("never sells weapons or business goods through a store", () => {
    const result = advanceProducerEconomy({
      turn: 1,
      accounts: [...accounts, { id: "arms", cash: 0 }],
      producers: [
        farm(),
        {
          ...farm(),
          id: "arms",
          accountId: "arms",
          outputs: [
            {
              commodity: "ordnance",
              unitsPerOutput: 1,
              book: "world",
              policy: { kind: "manual", unitPrice: 2 },
              referenceUnitPrice: 2,
              storable: true,
            },
          ],
        },
        store(10_000),
      ],
      households: [
        {
          ...household,
          products: [
            { commodity: "ordnance", book: "world", maximumUnitPrice: 4, weight: 1 },
            { commodity: "chemicals", book: "world", maximumUnitPrice: 4, weight: 1 },
          ],
        },
      ],
      storeMarkup: 0.15,
    });
    expect(result.storeSales!.channels).toEqual([]);
    expect(result.storeSales!.transfers).toEqual([]);
  });
});
