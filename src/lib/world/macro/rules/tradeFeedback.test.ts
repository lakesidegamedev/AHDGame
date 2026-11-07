import { describe, expect, it } from "vitest";
import {
  nextFundedTrade,
  scaleMacroCapacity,
  TRADE_CAPACITY_MAX_STEP,
  TRADE_FILL_WEIGHT,
  tradeCapacityFactor,
  tradeCapacityFactorAtTick,
} from "./tradeFeedback";

const outcome = (sold: number, offered: number, bought = 0, requested = 0) => ({
  offeredValue: offered,
  soldValue: sold,
  requestedValue: requested,
  boughtValue: bought,
});

describe("funded trade read back", () => {
  it("starts from the first turn's fills and lags later turns", () => {
    const first = nextFundedTrade(undefined, outcome(50, 100, 30, 40), 10);
    expect(first).toMatchObject({ turn: 10, exportFill: 0.5, importFill: 0.75, prior: null });
    const second = nextFundedTrade(first, outcome(100, 100, 40, 40), 11);
    expect(second.exportFill).toBeCloseTo(0.5 + TRADE_FILL_WEIGHT * 0.5);
    expect(second.importFill).toBeCloseTo(0.75 + TRADE_FILL_WEIGHT * 0.25);
    expect(second.prior).toEqual({ exportFill: 0.5, importFill: 0.75 });
  });

  it("a retried turn recomputes the same record instead of counting twice", () => {
    const first = nextFundedTrade(undefined, outcome(50, 100), 10);
    const second = nextFundedTrade(first, outcome(100, 100), 11);
    expect(nextFundedTrade(second, outcome(100, 100), 11)).toEqual(second);
  });

  it("a side with nothing offered keeps its fill", () => {
    const first = nextFundedTrade(undefined, outcome(20, 100), 10);
    expect(nextFundedTrade(first, outcome(0, 0), 11).exportFill).toBeCloseTo(0.2);
    expect(nextFundedTrade(undefined, outcome(0, 0), 10).exportFill).toBe(1);
  });

  it("shrinks capacity when exports do not sell, grows it slowly when they sell out", () => {
    expect(tradeCapacityFactor(0, 0.4)).toBeLessThan(1);
    expect(tradeCapacityFactor(0, 1)).toBe(1 - TRADE_CAPACITY_MAX_STEP);
    expect(tradeCapacityFactor(1, 0.4)).toBeGreaterThan(1);
    expect(tradeCapacityFactor(1, 0.4)).toBeLessThan(1.002);
    // A closed economy does not respond to trade.
    expect(tradeCapacityFactor(0, 0)).toBe(1);
  });

  it("applies only a record newer than the last tick", () => {
    const trade = nextFundedTrade(undefined, outcome(0, 100), 12);
    expect(
      tradeCapacityFactorAtTick({ fundedTrade: trade, lastTickTurn: 6, tradeExposure: 0.5 })
    ).toBeLessThan(1);
    expect(
      tradeCapacityFactorAtTick({ fundedTrade: trade, lastTickTurn: 12, tradeExposure: 0.5 })
    ).toBe(1);
    expect(
      tradeCapacityFactorAtTick({ fundedTrade: undefined, lastTickTurn: 6, tradeExposure: 0.5 })
    ).toBe(1);
  });

  it("scales capacity only", () => {
    const sectors = { manufacturing: { capacity: 100, productivity: 1, domesticDemand: 80 } };
    expect(scaleMacroCapacity(sectors, 0.98)).toEqual({
      manufacturing: { capacity: 98, productivity: 1, domesticDemand: 80 },
    });
    expect(scaleMacroCapacity(sectors, 1)).toBe(sectors);
  });
});
