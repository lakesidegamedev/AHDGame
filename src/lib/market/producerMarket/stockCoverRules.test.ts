import { describe, expect, it } from "vitest";
import {
  MARKDOWN_MIN_FACTOR,
  markdownFactor,
  markedDownAsk,
  stockCover,
  writeDownUnits,
} from "./stockCoverRules";

const policy = { coverTurns: 6 };

describe("stock cover markdown", () => {
  it("measures cover in turns of recent sales, infinite when nothing sold", () => {
    expect(stockCover(300, 50)).toBe(6);
    expect(stockCover(300, 0)).toBe(Number.POSITIVE_INFINITY);
    expect(stockCover(0, 0)).toBe(0);
  });

  it("does nothing within the cover or when off", () => {
    expect(markdownFactor(6, policy)).toBe(1);
    expect(markdownFactor(3, policy)).toBe(1);
    expect(markdownFactor(50, { coverTurns: 0 })).toBe(1);
  });

  it("falls with cover and stops at the minimum factor", () => {
    expect(markdownFactor(24, policy)).toBeCloseTo(0.5, 12); // (6/24)^0.5
    expect(markdownFactor(12, policy)).toBeCloseTo(Math.sqrt(0.5), 12);
    expect(markdownFactor(1000, policy)).toBe(MARKDOWN_MIN_FACTOR);
    expect(markdownFactor(Number.POSITIVE_INFINITY, policy)).toBe(MARKDOWN_MIN_FACTOR);
  });

  it("clears dead stock below the buyers' ceiling (JP food: ask 340.6, ceiling 320)", () => {
    const ask = markedDownAsk(340.6, 256, markdownFactor(Number.POSITIVE_INFINITY, policy));
    expect(ask).toBeLessThan(265);
    expect(ask).toBeGreaterThanOrEqual(256 * 0.6);
  });

  it("holds the ask at the reference floor, and leaves an ask already under it alone", () => {
    expect(markedDownAsk(100, 100, 0.5)).toBe(60);
    expect(markedDownAsk(50, 100, 0.5)).toBe(50);
    expect(markedDownAsk(100, 100, 1)).toBe(100);
  });

  it("writes down a small share of the stock beyond the cover", () => {
    expect(writeDownUnits(1000, 6, policy)).toBe(0);
    expect(writeDownUnits(1000, 12, policy)).toBeCloseTo(1000 * 0.02 * 0.5, 12);
    expect(writeDownUnits(1000, Number.POSITIVE_INFINITY, policy)).toBeCloseTo(20, 12);
  });
});

describe("cappedStockUnitCost", () => {
  it("caps a runaway unit cost at a multiple of the reference price and leaves sane costs alone", async () => {
    const { cappedStockUnitCost, MAX_STOCK_COST_MULTIPLE } = await import("./stockCoverRules");
    expect(cappedStockUnitCost(6.2e15, 272)).toBe(MAX_STOCK_COST_MULTIPLE * 272);
    expect(cappedStockUnitCost(250, 272)).toBe(250);
    expect(cappedStockUnitCost(250, 0)).toBe(250);
    expect(cappedStockUnitCost(Number.NaN, 272)).toBe(0);
  });
});
