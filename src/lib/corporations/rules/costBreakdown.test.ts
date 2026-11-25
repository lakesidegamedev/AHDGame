import { describe, expect, it } from "vitest";
import {
  addSiteCostParts,
  buildCostBreakdown,
  costDrivers,
  describeCostDriver,
  emptySiteCostParts,
  mapCostBreakdown,
  type CostBreakdown,
} from "./costBreakdown";
import { reconcileLastTurn } from "./lastTurnReconciliation";

const turn124: CostBreakdown = {
  wages: 60_000,
  inputs: 40_000,
  maintenance: 30_000,
  managementOverhead: 11_700,
  dominanceCost: 0,
  freight: 0,
  budgets: 5_000,
  other: 8_598,
};
const turn125: CostBreakdown = {
  wages: 87_600,
  inputs: 41_000,
  maintenance: 39_600,
  managementOverhead: 29_000,
  dominanceCost: 0,
  freight: 0,
  budgets: 5_000,
  other: 6_189,
};
const sum = (b: CostBreakdown) => Object.values(b).reduce((n, v) => n + v, 0);

describe("buildCostBreakdown", () => {
  it("sums to the recorded total, with the remainder in other", () => {
    const sites = emptySiteCostParts();
    addSiteCostParts(sites, { wages: 10, inputs: 5, maintenance: 3 });
    addSiteCostParts(sites, { wages: 2, managementOverhead: 1, freight: Number.NaN });
    const b = buildCostBreakdown(sites, 4, 30);
    expect(b).toMatchObject({ wages: 12, inputs: 5, maintenance: 3, managementOverhead: 1 });
    expect(b.budgets).toBe(4);
    expect(sum(b)).toBeCloseTo(30);
    expect(mapCostBreakdown(b, (n) => n * 2).wages).toBe(24);
  });
});

describe("costDrivers", () => {
  const prev = { turn: 124, totalCosts: sum(turn124), costBreakdown: turn124, headcount: 1505 };
  const next = { turn: 125, totalCosts: sum(turn125), costBreakdown: turn125, headcount: 2070 };

  it("names the categories behind a 10% or larger change, largest first, with headcount on wages", () => {
    const drivers = costDrivers(prev, next);
    expect(drivers.map((d) => d.category)).toEqual(["wages", "managementOverhead", "maintenance"]);
    const fmt = (n: number) => `$${Math.round(n)}`;
    expect(describeCostDriver(drivers[0]!, fmt)).toBe("Wages up 46%, headcount 1,505 to 2,070");
    expect(describeCostDriver(drivers[1]!, fmt)).toBe("Management overhead up 148%");
    expect(drivers[0]!.headcount).toEqual({ before: 1505, after: 2070 });
  });

  it("stays quiet for a small move or rows without categories", () => {
    expect(costDrivers(prev, { ...next, totalCosts: prev.totalCosts * 1.05 })).toEqual([]);
    expect(costDrivers({ ...prev, costBreakdown: null }, next)).toEqual([]);
    expect(costDrivers(prev, { ...next, costBreakdown: undefined })).toEqual([]);
  });

  it("describes a category that was zero before without a percentage", () => {
    const [d] = costDrivers(
      { turn: 1, totalCosts: 100, costBreakdown: { ...turn124, freight: 0 } },
      { turn: 2, totalCosts: 150, costBreakdown: { ...turn124, freight: 50 } }
    );
    expect(describeCostDriver(d!, (n) => `$${n}`)).toBe("Freight $0 to $50");
  });

  it("feeds the Finance last-turn section from the same recorded rows", () => {
    const rec = reconcileLastTurn(
      {
        turn: 125,
        revenue: 220_000,
        totalCosts: next.totalCosts,
        previousCosts: prev.totalCosts,
        retained: 0,
        dividendPaid: 0,
        tax: 0,
        cashAfter: 1,
        cashBefore: 1,
        costBreakdown: turn125,
        headcount: 2070,
        previousCostBreakdown: turn124,
        previousHeadcount: 1505,
      },
      []
    );
    expect(rec.statement.costDrivers[0]!.category).toBe("wages");
    expect(rec.statement.costDriversUnrecorded).toBe(false);
    const old = reconcileLastTurn(
      {
        turn: 125,
        revenue: 1,
        totalCosts: next.totalCosts,
        previousCosts: prev.totalCosts,
        retained: 0,
        dividendPaid: 0,
        tax: 0,
        cashAfter: 1,
        cashBefore: 1,
        costBreakdown: turn125,
      },
      []
    );
    expect(old.statement.costDrivers).toEqual([]);
    expect(old.statement.costDriversUnrecorded).toBe(true);
  });
});
