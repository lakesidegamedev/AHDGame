import { describe, expect, it } from "vitest";
import { fundedSectorTotalCost, isPlantlessSector, plantlessSectorView } from "./plantlessSector";

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
