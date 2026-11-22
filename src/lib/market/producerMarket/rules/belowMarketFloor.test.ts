import { describe, expect, it } from "vitest";
import { quoteProducer } from "../producerQuotes";
import { belowMarketAskFloor } from "./belowMarketFloor";

describe("belowMarketAskFloor", () => {
  it("is the unit cost when the market is above it", () => {
    expect(belowMarketAskFloor({ markup: -0.2, marketUnitPrice: 2070, unitCost: 1300 })).toBe(1300);
  });

  it("is the market price when the market is already under the unit cost", () => {
    expect(belowMarketAskFloor({ markup: -0.2, marketUnitPrice: 1151, unitCost: 1300 })).toBe(1151);
  });

  it("does not apply to normal or above-market postures, or without a unit cost", () => {
    expect(belowMarketAskFloor({ markup: 0, marketUnitPrice: 2070, unitCost: 1300 })).toBe(0);
    expect(belowMarketAskFloor({ markup: 0.1, marketUnitPrice: 2070, unitCost: 1300 })).toBe(0);
    expect(belowMarketAskFloor({ markup: -0.2, marketUnitPrice: 2070, unitCost: null })).toBe(0);
    expect(belowMarketAskFloor({ markup: -0.2, marketUnitPrice: 2070, unitCost: 0 })).toBe(0);
  });
});

describe("below-market automatic ask", () => {
  // Unit cost 1,000 + 30,000 / 100 = 1,300.
  const seller = {
    referenceUnitPrice: 2916,
    variableUnitCost: 1000,
    fixedCost: 30000,
    offeredUnits: 100,
    demand: [{ units: 1000, maximumUnitPrice: 5000 }],
    competitors: [],
  };
  const ask = (targetMarkup: number, clearingUnitPrice: number, extra = {}) =>
    quoteProducer({
      ...seller,
      ...extra,
      policy: { kind: "automatic", targetMarkup },
      clearingUnitPrice,
    }).unitPrice;

  it("keeps a cut that stays above the unit cost", () => {
    expect(ask(-0.2, 2070)).toBeCloseTo(1656, 6);
    expect(ask(-0.2, 2070, { soldNothingLastTurn: true })).toBeCloseTo(1656, 6);
  });

  it("stops a cut that would land under the unit cost at the unit cost", () => {
    expect(ask(-0.2, 1365)).toBeCloseTo(1300, 6);
    expect(ask(-0.2, 1365, { soldNothingLastTurn: true })).toBeCloseTo(1300, 6);
  });

  it("asks the market price when the market is already under the unit cost", () => {
    expect(ask(-0.2, 1151)).toBeCloseTo(1151, 6);
  });

  it("does not let the profit search pick a cheaper competitor price under the floor", () => {
    const crowded = {
      demand: [{ units: 100, maximumUnitPrice: 5000 }],
      competitors: [{ units: 200, unitPrice: 900 }],
    };
    expect(ask(-0.2, 1365, crowded)).toBeCloseTo(1300, 6);
    // A normal seller is unchanged and may still meet the cheaper competitor.
    expect(ask(0, 1365, crowded)).toBeCloseTo(900, 6);
  });

  it("leaves normal and above-market postures unchanged", () => {
    expect(ask(0, 1151)).toBeCloseTo(1151, 6);
    expect(ask(0.1, 1151)).toBeCloseTo(1266.1, 6);
    expect(ask(0, 2070)).toBeCloseTo(2070, 6);
  });

  it("stops a cutter that sets the clearing from compounding its own cut", () => {
    let clearing = 2264;
    const path: number[] = [];
    for (let turn = 0; turn < 6; turn++) {
      clearing = ask(-0.2, clearing);
      path.push(clearing);
    }
    expect(path[0]).toBeCloseTo(1811.2, 6);
    expect(path[1]).toBeCloseTo(1448.96, 6);
    for (const price of path.slice(2)) expect(price).toBeCloseTo(1300, 6);
  });
});
