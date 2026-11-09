import { describe, expect, it } from "vitest";
import {
  siteStatement,
  sectorSiteStatement,
  scaleSiteStatement,
  consolidateSiteStatements,
  reconcileSiteStatements,
  matchingSiteReceipt,
} from "./siteStatement";
import { fundedSectorOps, fundedSectorResult } from "@/lib/market/producerMarket/fundedSectorRules";

describe("site statement", () => {
  it("never turns an opportunity-value estimate into profit or margin", () => {
    const s = siteStatement({ revenue: 0, totalCost: 100, ownSiteValue: 200 });
    expect(s).toMatchObject({
      revenue: 0,
      totalCost: 100,
      profit: -100,
      ownSiteMemo: 200,
      netMarginPct: null,
    });
  });
  it("keeps a genuinely losing mixed supplier negative after internal pricing", () => {
    const s = siteStatement({ revenue: 150, totalCost: 1100, income: 550, charge: 60 });
    expect(s).toMatchObject({ revenue: 700, totalCost: 1160, profit: -460 });
    expect(s.netMarginPct).toBeCloseTo((-460 / 700) * 100);
  });
  it.each(["free", "cost", "market"] as const)(
    "reads %s allocations through persistence on one basis",
    (mode) => {
      const income = mode === "free" ? 0 : mode === "cost" ? 100 : 200;
      const receipt = {
        turn: 12,
        revenue: 0,
        profit: -100,
        producedUnits: 10,
        soldUnits: 0,
        internalSupplyIncome: income,
      };
      const legacy = { hourlyRevenue: 0, costs: 100, effectiveMargin: 0, hourlyGrowthCost: 0 };
      const result = fundedSectorResult(legacy, receipt);
      const ops = fundedSectorOps(
        [{ updateOne: { filter: { _id: "supplier" }, update: { $set: { realizedRevenue: 0 } } } }],
        "supplier",
        receipt,
        result,
        (n) => n * 24,
        24
      );
      const saved = ops[0].updateOne.update.$set as {
        plantsPnl: {
          revenue: number;
          totalCost: number;
          profit: number;
          internalSupplyIncome?: number;
          source: string;
        };
      };
      const supplier = sectorSiteStatement(
        { ...saved, producerSettlement: { turn: 12 } },
        { revenue: 999, totalCost: 999 }
      );
      expect(supplier.turn).toBe(12);
      expect(supplier.revenue).toBe(income * 24);
      expect(supplier.profit).toBe((income - 100) * 24);
      expect(supplier.revenue - supplier.totalCost).toBe(supplier.profit);
      const buyer = siteStatement({ revenue: 1000 * 24, totalCost: 500 * 24, charge: income * 24 });
      const consolidated = consolidateSiteStatements([supplier, buyer]);
      expect(consolidated).toEqual({ revenue: 24000, totalCost: 14400, profit: 9600 });
      const converted = scaleSiteStatement(supplier, 150);
      expect(converted.revenue).toBe(supplier.revenue * 150);
      expect(converted.profit).toBe(supplier.profit * 150);
      expect(converted.netMarginPct).toBe(supplier.netMarginPct);
    }
  );
  it("shows stock and support as cost credits, with no invented sales", () => {
    const s = sectorSiteStatement(
      {
        plantsPnl: {
          source: "funded",
          revenue: 100,
          totalCost: 80,
          profit: 20,
          stockAddedAtCost: 10,
          transitionSupport: 5,
          internalSupplyIncome: 30,
          internalSupplyCharge: 7,
        },
        producerSettlement: { turn: 2 },
      },
      { revenue: 999, totalCost: 999 }
    );
    expect(s).toMatchObject({
      externalRevenue: 100,
      externalCost: 80,
      inventoryCredit: 10,
      supportCredit: 5,
      revenue: 130,
      totalCost: 72,
      profit: 58,
    });
  });
  it("retains an older receipt's turn rather than claiming current pricing", () => {
    const s = sectorSiteStatement(
      {
        plantsPnl: {
          source: "funded",
          turn: 1,
          revenue: 0,
          totalCost: 50,
          profit: -50,
          internalSupplyIncome: 100,
        },
        producerSettlement: { turn: 1 },
      },
      { revenue: 999, totalCost: 999 }
    );
    expect(s.turn).toBe(1);
    expect(s.profit).toBe(50);
    const untagged = sectorSiteStatement(
      {
        plantsPnl: { source: "funded", revenue: 0, totalCost: 50, profit: -50 },
        producerSettlement: { turn: 99 },
      },
      { revenue: 0, totalCost: 50 }
    );
    expect(untagged.turn).toBeNull();
    const legacy = sectorSiteStatement({}, { revenue: 200, totalCost: 150 });
    expect(legacy).toMatchObject({ turn: null, revenue: 200, profit: 50 });
  });
  it("ignores invalid transfer amounts and keeps credits signed separately", () => {
    expect(
      siteStatement({
        revenue: 100,
        totalCost: 80,
        income: NaN,
        charge: -2,
        ownSiteValue: Infinity,
      })
    ).toMatchObject({ profit: 20, income: 0, charge: 0, ownSiteMemo: 0 });
  });
});

it("does not join cost details from a different turn or an undated summary", () => {
  const receipt = { turn: 2, inputsConsumed: 50 };
  expect(
    matchingSiteReceipt({ plantsPnl: { source: "funded", turn: 1 }, producerSettlement: receipt })
  ).toBeNull();
  expect(
    matchingSiteReceipt({ plantsPnl: { source: "funded" }, producerSettlement: receipt })
  ).toBeNull();
  expect(
    matchingSiteReceipt({ plantsPnl: { source: "funded", turn: 2 }, producerSettlement: receipt })
  ).toBe(receipt);
});

describe("reconcileSiteStatements", () => {
  it("bridges the row sum to the consolidated profit by the net internal charge", () => {
    const rows = [
      siteStatement({ revenue: 1000, totalCost: 400, charge: 300 }),
      siteStatement({ revenue: 2000, totalCost: 900, charge: 200 }),
    ];
    const r = reconcileSiteStatements(rows);
    expect(r).toEqual({ income: 0, charge: 500, rowsProfit: 1200, netCharge: 500 });
    expect(consolidateSiteStatements(rows).profit - r.rowsProfit).toBe(r.netCharge);
  });
  it("has no gap when income and charge offset", () => {
    const rows = [
      siteStatement({ revenue: 1000, totalCost: 400, income: 300 }),
      siteStatement({ revenue: 2000, totalCost: 900, charge: 300 }),
    ];
    expect(reconcileSiteStatements(rows).netCharge).toBe(0);
  });
});
