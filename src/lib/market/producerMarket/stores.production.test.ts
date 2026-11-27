import { describe, expect, it } from "vitest";
import { advanceProducerEconomy, type ProductionPlan } from "./production";
import { laneKeyOf } from "./laneKey";
import { STORE_MARKUP_DEFAULT } from "@/lib/stores/rules/storeRules";

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

describe("stores pay only for the capacity their sales need", () => {
  it("runs, staffs and bills a store for the goods it resold, and idles the rest", () => {
    const big: ProductionPlan = {
      ...store(100),
      capacityUnits: 1000,
      labourCost: 400,
      otherOperatingCost: 300,
      idleOperatingCost: 20,
    };
    const result = advanceProducerEconomy({
      turn: 1,
      accounts: accounts.map((a) => (a.id === "storeCorp" ? { ...a, cash: 10_000 } : a)),
      producers: [farm(), big],
      households: [household],
      storeMarkup: 0.15,
    });
    const row = result.storeSales!.stores[0];
    const s = result.producers.find((p) => p.id === "store")!;
    // 100 000 of resale capacity against about 600 of routed food: the store
    // needs a small share of its run, and runs only that.
    const usedShare = row.goodsBoughtWholesale / (1000 * 100);
    expect(usedShare).toBeGreaterThan(0);
    expect(usedShare).toBeLessThan(0.01);
    expect(s.producedUnits).toBeCloseTo(row.goodsBoughtWholesale / 100, 6);
    // Wages follow the run; idle capacity keeps only its upkeep.
    expect(s.labourPaid).toBeCloseTo(400 * usedShare, 6);
    expect(s.otherOperatingPaid).toBeCloseTo(20 + (300 - 20) * usedShare, 6);
    expect(cashOf(result, "storeWages")).toBeCloseTo(400 * usedShare, 6);
    // What it did not need it kept: the markup less the share of its bills.
    expect(s.profit).toBeCloseTo(row.markupEarned - s.labourPaid - s.otherOperatingPaid, 6);
    // Throttles still see an oversized store: it offered its full run.
    expect(s.offeredUnits).toBeCloseTo(1000, 6);
  });
});

describe("a typical player retail company at the 40% markup", () => {
  // Walmart from live turns 228 to 250 (anchor money). Its profit averaged
  // 349 000 a turn on t228-233 (340 870 USD). Outside its stores it earns about
  // 27 700. Its stores spend 12.9 cents of running costs per dollar of goods
  // resold. With their capacity no longer cut by sell-through, its stores reach
  // about 1.57M of household spending a turn at today's demand (each state's
  // shoppers shared pro rata to capacity).
  const profitBeforeStores = 349_100;
  const outsideStores = 27_700;
  const costPerResold = 0.129;
  const V = 880;
  const capacityValue = 1_572_000;
  const capacityUnits = capacityValue / V;
  const retailer: ProductionPlan = {
    ...store(V),
    capacityUnits,
    labourCost: costPerResold * capacityValue * 0.4,
    otherOperatingCost: costPerResold * capacityValue * 0.6,
    idleOperatingCost: 0,
  };
  const bigFarm: ProductionPlan = { ...farm(), capacityUnits: 10_000_000 };
  const storeProfit = (markup: number) =>
    advanceProducerEconomy({
      turn: 1,
      accounts: accounts.map((a) =>
        a.id === "storeCorp"
          ? { ...a, cash: 2_000_000 }
          : a.id === "hh"
            ? { ...a, cash: 12_000_000 }
            : a
      ),
      producers: [bigFarm, retailer],
      households: [household],
      storeMarkup: markup,
      // Food last cleared at the farm's price: households spend half their ceiling.
      clearingPriceByLane: { [laneKeyOf("food", "world")]: 2 },
    }).producers.find((p) => p.id === "store")!.profit;

  it("earns about its pre-stores profit at the standing markup", () => {
    expect(STORE_MARKUP_DEFAULT).toBe(0.4);
    const profit = storeProfit(STORE_MARKUP_DEFAULT) + outsideStores;
    // Capacity-bound: it resells capacity / 1.4 and keeps the markup less running costs.
    expect(storeProfit(0.4)).toBeCloseTo((capacityValue / 1.4) * (0.4 - costPerResold), -2);
    expect(Math.abs(profit / profitBeforeStores - 1)).toBeLessThan(0.2);
  });

  it("would fall well short at the old 35% markup", () => {
    const at35 = storeProfit(0.35) + outsideStores;
    expect(at35 / profitBeforeStores).toBeLessThan(0.85);
  });
});
