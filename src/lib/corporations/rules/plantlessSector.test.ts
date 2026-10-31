import { describe, expect, it } from "vitest";
import {
  fundedSectorProfit,
  fundedSectorTotalCost,
  isPlantlessSector,
  plantlessSectorView,
  sectorMaintenanceAndProfit,
} from "./plantlessSector";

describe("plantlessSectorView", () => {
  it("clears the opening stamps on a sector with no plants yet", () => {
    // A logistics depot just ordered: no capacity, its build still queued, but
    // the open command stamped a starting crew and a nameplate revenue.
    const opened = {
      capitalStock: 0,
      plantCount: 0,
      revenue: 25_895,
      workers: 500,
      workersDesired: 500,
    };
    expect(isPlantlessSector(opened)).toBe(true);
    expect(plantlessSectorView(opened)).toMatchObject({
      revenue: 0,
      realizedRevenue: 0,
      workers: 0,
      workersDesired: 0,
    });
  });

  it("leaves a sector with plants alone", () => {
    const running = { capitalStock: 85.4, plantCount: 3, revenue: 128_615, workers: 18 };
    expect(isPlantlessSector(running)).toBe(false);
    expect(plantlessSectorView(running)).toBe(running);
  });

  it("keeps the figures of a sector that still booked a sale or made output", () => {
    expect(isPlantlessSector({ capitalStock: 0, revenue: 10, realizedRevenue: 400 })).toBe(false);
    expect(isPlantlessSector({ capitalStock: 0, revenue: 10, producedUnits: 2 })).toBe(false);
    expect(isPlantlessSector({ capitalStock: 0, plantCount: 1, revenue: 10 })).toBe(false);
  });
});

describe("fundedSectorTotalCost", () => {
  it("reads the bill of a funded row, including one that sold nothing", () => {
    expect(
      fundedSectorTotalCost({
        source: "funded",
        totalCost: 25_178,
      })
    ).toBe(25_178);
  });

  it("is null for a row the funded settlement did not write", () => {
    expect(fundedSectorTotalCost({ totalCost: 10 })).toBeNull();
    expect(fundedSectorTotalCost(null)).toBeNull();
    expect(fundedSectorTotalCost({ source: "funded", totalCost: Number.NaN })).toBeNull();
  });
});

describe("fundedSectorProfit", () => {
  it("reads the booked profit of a funded row only", () => {
    expect(fundedSectorProfit({ source: "funded", profit: -9_660_000 })).toBe(-9_660_000);
    expect(fundedSectorProfit({ profit: 10 })).toBeNull();
    expect(fundedSectorProfit({ source: "funded", profit: Number.NaN })).toBeNull();
    expect(fundedSectorProfit(undefined)).toBeNull();
  });
});

describe("sectorMaintenanceAndProfit", () => {
  const base = {
    engine: null,
    fundedProfit: null,
    economicRevenue: 0,
    effectiveMarginPct: 0,
    growthCost: 16,
    freightNet: 0,
  };

  it("shows a funded plant that sold nothing losing its whole bill, not just its growth charge", () => {
    // The inversion: zero revenue gives a zero bill, leaving only growth.
    expect(sectorMaintenanceAndProfit(base).profit).toBe(-16);
    const funded = sectorMaintenanceAndProfit({ ...base, fundedProfit: -9_660_000 });
    expect(funded.profit).toBe(-9_660_000);
    // The page lines still sum back: revenue - maintenance - growth = profit.
    expect(0 - funded.maintenance - 16).toBe(funded.profit);
  });

  it("adds freight beside the booked profit", () => {
    expect(
      sectorMaintenanceAndProfit({
        ...base,
        fundedProfit: 500,
        economicRevenue: 900,
        freightNet: -20,
      }).profit
    ).toBe(480);
  });

  it("prefers the engine lines over a funded profit", () => {
    expect(
      sectorMaintenanceAndProfit({
        ...base,
        engine: { operatingCost: 70, profit: 30 },
        fundedProfit: -1,
        freightNet: 5,
      })
    ).toEqual({ maintenance: 70, profit: 35 });
  });
});
