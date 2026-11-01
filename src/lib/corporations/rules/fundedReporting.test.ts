import { describe, expect, it } from "vitest";
import { fundedSalesTelemetry, readFundedPnl } from "./fundedReporting";

describe("funded sector reporting", () => {
  it("reports no market sales even when output went to own sites", () => {
    expect(
      fundedSalesTelemetry({
        producedUnits: 100,
        offeredUnits: 100,
        soldUnits: 0,
        products: [{ commodity: "energy", offeredUnits: 100, soldUnits: 0, revenue: 0 }],
      })
    ).toEqual({
      soldFraction: 0,
      soldByCommodity: { energy: 0 },
      revenueShareByCommodity: { energy: 0 },
    });
  });

  it("uses offered stock and each output's actual sales and revenue", () => {
    expect(
      fundedSalesTelemetry({
        producedUnits: 50,
        offeredUnits: 200,
        soldUnits: 100,
        products: [
          { commodity: "steel", offeredUnits: 100, soldUnits: 100, revenue: 300 },
          { commodity: "energy", offeredUnits: 100, soldUnits: 0, revenue: 0 },
        ],
      })
    ).toEqual({
      soldFraction: 0.5,
      soldByCommodity: { steel: 1, energy: 0 },
      revenueShareByCommodity: { steel: 1, energy: 0 },
    });
    expect(fundedSalesTelemetry({ producedUnits: 0, soldUnits: 0 }).soldFraction).toBe(1);
  });

  it("reads a zero-sales loss without adding stock or support memos to profit", () => {
    const pnl = {
      source: "funded",
      revenue: 0,
      profit: -900,
      totalCost: 900,
      stockAddedAtCost: 800,
      transitionSupport: 50,
    };
    expect(readFundedPnl(pnl)).toEqual({ profit: -900, totalCost: 900 });
    expect(readFundedPnl({ source: "funded", totalCost: 900 })).toBeNull();
    expect(readFundedPnl({ source: "funded", totalCost: NaN, profit: -900 })).toBeNull();
    expect(readFundedPnl({ totalCost: 900, profit: -900 })).toBeNull();
  });
});
