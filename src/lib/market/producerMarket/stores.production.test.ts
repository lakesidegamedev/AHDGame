import { describe, expect, it } from "vitest";
import { advanceProducerEconomy, type ProductionPlan } from "./production";
import { laneKeyOf } from "./laneKey";
import {
  STORE_MARKUP_DEFAULT,
  STORE_TRANSITION_DEFAULT_START_MARKUP,
  STORE_TRANSITION_DEFAULT_TURNS,
  STORE_TYPICAL_RUNNING_COST_SHARE,
  storeMarkupForTurn,
} from "@/lib/stores/rules/storeRules";

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

describe("a typical player retail company crosses over without a cliff", () => {
  // Walmart-like company, from live turns 228 to 235. Its stores could resell
  // about 3.45M of goods a turn at the 4.5 throughput multiple and spend about
  // 12.5% of what they resell on running costs (wages 4/11, site and supplies
  // 7/11; supplies are folded into site bills here, the fixture has no
  // supplier). Its last pre-switch profit was 418 643 a turn; household money
  // doubles by the planned switch at turn 247, and basket revenue scaled with
  // it, so the turn before the switch it would have made about 837 000.
  const V = 880;
  const capacityUnits = 3920;
  const capacityValue = V * capacityUnits;
  const runningAtFullRun = STORE_TYPICAL_RUNNING_COST_SHARE * capacityValue;
  const profitBeforeSwitch = 2 * 418_643;
  const retailer: ProductionPlan = {
    ...store(V),
    capacityUnits,
    labourCost: (runningAtFullRun * 4) / 11,
    otherOperatingCost: (runningAtFullRun * 7) / 11,
    idleOperatingCost: 0,
  };
  const bigFarm: ProductionPlan = { ...farm(), capacityUnits: 10_000_000 };
  // Households in the store's state, with more routed food demand than the
  // stores can carry at any markup in the changeover.
  const hh = { ...household, accountId: "hh" };
  const turnProfit = (markup: number) => {
    const result = advanceProducerEconomy({
      turn: 1,
      accounts: accounts.map((a) =>
        a.id === "storeCorp"
          ? { ...a, cash: 2_000_000 }
          : a.id === "hh"
            ? { ...a, cash: 12_000_000 }
            : a
      ),
      producers: [bigFarm, retailer],
      households: [hh],
      storeMarkup: markup,
      // Food last cleared at the farm's price: households spend half their ceiling.
      clearingPriceByLane: { [laneKeyOf("food", "world")]: 2 },
    });
    return result.producers.find((p) => p.id === "store")!.profit;
  };
  const schedule = { startTurn: 247 };
  const markups = Array.from({ length: STORE_TRANSITION_DEFAULT_TURNS + 1 }, (_, i) =>
    storeMarkupForTurn({ standingMarkup: undefined, transition: schedule, turn: 247 + i })
  );
  const profits = markups.map(turnProfit);
  // Capacity-bound: it resells capacity / (1 + markup) wholesale and keeps the
  // markup less its running costs on that.
  const capacityBound = (markup: number) =>
    (capacityValue / (1 + markup)) * (markup - STORE_TYPICAL_RUNNING_COST_SHARE);

  it("stays within about 20% of its pre-switch profit on the first stores turn", () => {
    expect(markups[0]).toBeCloseTo(STORE_TRANSITION_DEFAULT_START_MARKUP, 12);
    expect(Math.abs(profits[0] / profitBeforeSwitch - 1)).toBeLessThan(0.2);
  });

  it("moves by less than a fifth each turn of the changeover", () => {
    for (let i = 1; i < profits.length; i++) {
      expect(profits[i]).toBeLessThan(profits[i - 1]);
      expect(profits[i] / profits[i - 1]).toBeGreaterThan(0.8);
    }
  });

  it("settles on the standing 35% markup at about a third under its basket-era profit", () => {
    expect(markups.at(-1)).toBe(STORE_MARKUP_DEFAULT);
    expect(STORE_MARKUP_DEFAULT).toBe(0.35);
    expect(profits.at(-1)!).toBeCloseTo(capacityBound(0.35), 0);
    // 3.45M / 1.35 x 0.225 = about 575 000 against about 837 000 before.
    const change = profits.at(-1)! / profitBeforeSwitch - 1;
    expect(change).toBeGreaterThan(-0.35);
    expect(change).toBeLessThan(-0.25);
  });

  it("would keep 30% to 40% of its value added at a 15% markup (throughput calibration)", () => {
    const profit = turnProfit(0.15);
    expect(profit).toBeCloseTo(capacityBound(0.15), 0);
    // Supplies are about 70 of the 110 a capacity unit costs (8% of goods resold).
    const valueAdded =
      (capacityValue / 1.15) * (0.15 - (STORE_TYPICAL_RUNNING_COST_SHARE * 70) / 110);
    const share = profit / valueAdded;
    expect(share).toBeGreaterThan(0.3);
    expect(share).toBeLessThan(0.4);
  });
});
