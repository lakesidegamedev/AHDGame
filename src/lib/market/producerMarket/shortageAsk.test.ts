import { describe, expect, it } from "vitest";
import { advanceProducerEconomy, type ProductionPlan } from "./production";
import { shortageAsk, shortageAskStep, SHORTAGE_ASK_DEFAULT_MAX_STEP } from "./shortageAskRules";
import type { MarketAccount, PurchaseOrder } from "./rules";

describe("shortage ask rules", () => {
  it("steps a sold-out seller above the clearing when buyers went short", () => {
    // Iron on turn 673: 34% of orders unfilled, so requested / delivered = 1.52.
    const pressure = 1 / 0.66;
    expect(shortageAskStep({ pressure, soldOut: true })).toBe(SHORTAGE_ASK_DEFAULT_MAX_STEP);
    expect(
      shortageAsk({ clearingUnitPrice: 46, referenceUnitPrice: 217, pressure, soldOut: true })
    ).toBeCloseTo(46 * 1.05);
  });

  it("scales the step with the unfilled share below the cap", () => {
    expect(shortageAskStep({ pressure: 1.1, soldOut: true })).toBeCloseTo(0.025);
    expect(shortageAskStep({ pressure: 1.6, soldOut: true, maxStep: 0.1 })).toBeCloseTo(0.1);
  });

  it("holds the clearing when the lane cleared, the seller had stock left, or there is no reading", () => {
    const base = { clearingUnitPrice: 46, referenceUnitPrice: 217 };
    expect(shortageAsk({ ...base, pressure: 1, soldOut: true })).toBe(46);
    expect(shortageAsk({ ...base, pressure: 1.02, soldOut: true })).toBe(46);
    expect(shortageAsk({ ...base, pressure: 1.5, soldOut: false })).toBe(46);
    expect(shortageAsk({ ...base, pressure: undefined, soldOut: true })).toBe(46);
    expect(shortageAsk({ ...base, pressure: Number.NaN, soldOut: true })).toBe(46);
  });

  it("never passes the ceiling and never lowers a price already above it", () => {
    expect(
      shortageAsk({ clearingUnitPrice: 640, referenceUnitPrice: 217, pressure: 2, soldOut: true })
    ).toBeCloseTo(651);
    expect(
      shortageAsk({ clearingUnitPrice: 700, referenceUnitPrice: 217, pressure: 2, soldOut: true })
    ).toBe(700);
    expect(
      shortageAsk({
        clearingUnitPrice: 320,
        referenceUnitPrice: 217,
        pressure: 2,
        soldOut: true,
        maxMultiplier: 1.5,
      })
    ).toBeCloseTo(325.5);
  });

  it("from 0.21x reference reaches the 0.6x market floor in about 22 turns at the default step", () => {
    let price = 46;
    let turns = 0;
    while (price < 0.6 * 217 && turns < 100) {
      price = shortageAsk({
        clearingUnitPrice: price,
        referenceUnitPrice: 217,
        pressure: 1.5,
        soldOut: true,
      });
      turns++;
    }
    expect(turns).toBe(22);
  });
});

// A mine that sold all 10 units it offered last turn at 46, in a lane where
// buyers asked for 15 and got 10. It has no stock left over.
const mine = (changes: Partial<ProductionPlan> = {}): ProductionPlan => ({
  id: "mine",
  accountId: "corp",
  capacityUnits: 10,
  activeFraction: 1,
  outputMultiplier: 1,
  labourCost: 0,
  otherOperatingCost: 0,
  labourRecipientAccountId: "households",
  operatingRecipientAccountId: "services",
  inputs: [],
  outputs: [
    {
      commodity: "iron",
      unitsPerOutput: 1,
      book: "world",
      policy: { kind: "automatic", targetMarkup: 0 },
      referenceUnitPrice: 217,
      storable: true,
    },
  ],
  inputStock: [],
  outputStock: [],
  recentSoldUnits: 10,
  recentSoldByOutput: { "iron|world": 10 },
  ...changes,
});
const buyer: PurchaseOrder = {
  id: "mill",
  accountId: "buyers",
  commodity: "iron",
  book: "world",
  units: 15,
  maximumUnitPrice: 600,
};
const accounts: MarketAccount[] = [
  { id: "corp", cash: 0 },
  { id: "households", cash: 0 },
  { id: "services", cash: 0 },
  { id: "buyers", cash: 10_000 },
];
const settle = (
  over: Partial<Parameters<typeof advanceProducerEconomy>[0]> = {},
  plan: Partial<ProductionPlan> = {}
) =>
  advanceProducerEconomy({
    turn: 2,
    accounts,
    producers: [mine(plan)],
    externalOrders: [buyer],
    clearingPriceByLane: { "iron|world": 46 },
    stockCoverTurns: 1,
    ...over,
  });
const ask = (result: ReturnType<typeof settle>) =>
  result.tradeReceipt.offers.find((o) => o.commodity === "iron")!.unitPrice;

describe("shortage ask below cost (stage 2)", () => {
  const base = { referenceUnitPrice: 217, pressure: 1.5, soldOut: true };
  it("climbs while the price is under the seller's cost and stops at it", () => {
    expect(shortageAsk({ ...base, clearingUnitPrice: 46, costUnitPrice: 95 })).toBeCloseTo(
      46 * 1.05
    );
    expect(shortageAsk({ ...base, clearingUnitPrice: 93, costUnitPrice: 95 })).toBeCloseTo(95);
  });
  it("holds a seller that already earns above its cost: that shortage needs capacity", () => {
    expect(shortageAsk({ ...base, clearingUnitPrice: 357, costUnitPrice: 207 })).toBe(357);
  });
  it("never passes the highest bid in the lane", () => {
    expect(
      shortageAsk({
        ...base,
        referenceUnitPrice: 2400,
        clearingUnitPrice: 2100,
        costUnitPrice: 3000,
        topBuyerUnitPrice: 2157,
      })
    ).toBeCloseTo(2157);
    expect(
      shortageAsk({
        ...base,
        referenceUnitPrice: 2400,
        clearingUnitPrice: 2100,
        costUnitPrice: 3000,
        topBuyerUnitPrice: 2000,
      })
    ).toBe(2100);
  });
});

describe("shortage ask in the settlement", () => {
  it("is off unless passed: the settlement is identical", () => {
    expect(JSON.stringify(settle({ shortageAsk: undefined }))).toBe(JSON.stringify(settle()));
    expect(ask(settle())).toBe(46);
  });

  it("raises a sold-out automatic ask in a short lane, and the buyer pays it", () => {
    const run = settle({ shortageAsk: { pressureByLane: { "iron|world": 1.5 } } });
    expect(ask(run)).toBeCloseTo(48.3);
    const iron = run.prices.find((p) => p.commodity === "iron")!;
    expect(iron.value / iron.units).toBeCloseTo(48.3);
  });

  it("leaves the ask at the clearing when the lane cleared or the mine had stock left", () => {
    expect(ask(settle({ shortageAsk: { pressureByLane: { "iron|world": 1 } } }))).toBe(46);
    const stocked = settle(
      { shortageAsk: { pressureByLane: { "iron|world": 1.5 } } },
      { outputStock: [{ commodity: "iron", book: "world", units: 5 }] }
    );
    expect(ask(stocked)).toBeLessThanOrEqual(46);
  });

  it("below cost: a profitable mine holds, an under-cost mine climbs (stage 2)", () => {
    const short = { shortageAsk: { pressureByLane: { "iron|world": 1.5 }, belowCost: true } };
    // No wages or inputs: cost per unit is 0, the mine is profitable at 46, so it holds.
    expect(ask(settle(short))).toBe(46);
    // Wages of 950 over 10 planned units: cost 95 a unit, above 46, so it climbs 5%.
    expect(ask(settle(short, { labourCost: 950 }))).toBeCloseTo(48.3);
  });

  it("never raises a manual price", () => {
    const manual = settle(
      { shortageAsk: { pressureByLane: { "iron|world": 2 } } },
      {
        outputs: [
          {
            commodity: "iron",
            unitsPerOutput: 1,
            book: "world",
            policy: { kind: "manual", unitPrice: 40 },
            referenceUnitPrice: 217,
            storable: true,
          },
        ],
      }
    );
    expect(ask(manual)).toBe(40);
  });
});
