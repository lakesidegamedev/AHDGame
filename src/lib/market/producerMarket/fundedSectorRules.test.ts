import { describe, expect, it } from "vitest";
import {
  fundedCashIncome,
  fundedSectorOps,
  fundedSectorResult,
  SETTLEMENT_OWNED_SECTOR_FIELDS,
} from "./fundedSectorRules";

const legacy = { hourlyRevenue: 500, effectiveMargin: 40, costs: 300, hourlyGrowthCost: 10, x: 1 };
const receipt = { revenue: 100, profit: 30, producedUnits: 12.345, soldUnits: 10 };

describe("funded sector result", () => {
  it("takes revenue and producer costs from the receipt and keeps growth spend", () => {
    const r = fundedSectorResult(legacy, receipt);
    expect(r.hourlyRevenue).toBe(100);
    expect(r.costs).toBe(80);
    expect(r.effectiveMargin).toBeCloseTo(20);
    expect(r.x).toBe(1);
  });

  it("reports zero margin with no sales", () => {
    expect(
      fundedSectorResult(legacy, { ...receipt, revenue: 0, profit: -50 }).effectiveMargin
    ).toBe(0);
  });
});

describe("funded sector ops", () => {
  const ops = [
    {
      updateOne: {
        filter: { _id: "s1" },
        update: {
          $set: {
            revenue: 9,
            realizedRevenue: 999,
            inventoryUnits: { food: 4 },
            capitalStock: 7,
            "buildQueue.0.onlineTurn": 3,
            wageLevel: 1.1,
          },
          $pull: { buildQueue: { onlineTurn: { $lte: 5 } } },
        },
      },
    },
    { updateOne: { filter: { _id: "s1" }, update: { $push: { buildQueue: { id: "credit" } } } } },
    {
      updateOne: {
        filter: { _id: "s1", activeCapacityPercent: 50 },
        update: { $set: { activeCapacityPercent: 60 } },
      },
    },
    { updateOne: { filter: { _id: "s2" }, update: { $set: { capitalStock: 1 } } } },
  ];

  it("drops settlement-owned fields and build side ops, stamps the receipt, leaves other sectors alone", () => {
    const result = fundedSectorResult(legacy, receipt);
    const out = fundedSectorOps(ops, "s1", receipt, result, (a) => a * 24, 24);
    expect(out).toHaveLength(3);
    const main = out[0].updateOne.update as { $set: Record<string, unknown> };
    for (const f of SETTLEMENT_OWNED_SECTOR_FIELDS) expect(main.$set).not.toHaveProperty(f);
    expect(main.$set).not.toHaveProperty("buildQueue.0.onlineTurn");
    expect(main).not.toHaveProperty("$pull");
    expect(main.$set).toMatchObject({
      revenue: 9,
      wageLevel: 1.1,
      realizedRevenue: 2400,
      producedUnits: 296.28,
      soldUnits: 240,
      effectiveProfitMargin: 20,
    });
    expect(main.$set.plantsPnl).toMatchObject({ revenue: 2400, profit: 480, totalCost: 1920 });
    expect(out[1].updateOne.update).toEqual({ $set: { activeCapacityPercent: 60 } });
    expect(out[2]).toBe(ops[3]);
  });
});

describe("funded cash income", () => {
  it("removes the producer profit the settlement already paid", () => {
    expect(fundedCashIncome(50, 70)).toBe(-20);
  });
});

describe("funded sector result keeps policy costs", () => {
  it("charges regulatory compliance on top of the receipt", () => {
    const r = fundedSectorResult({ ...legacy, regulatoryBurden: 5 }, receipt);
    expect(r.costs).toBe(85);
  });
});

describe("funded sector result charges size costs as points of revenue", () => {
  it("adds fundedSizeCostPp percent of receipt revenue to the costs", () => {
    const r = fundedSectorResult({ ...legacy, fundedSizeCostPp: 5 }, receipt);
    // receipt costs 70 + growth 10 + 5% of 100 revenue
    expect(r.costs).toBeCloseTo(85);
    expect(r.effectiveMargin).toBeCloseTo(15);
  });

  it("charges nothing extra when the legacy result carries no size cost", () => {
    expect(fundedSectorResult(legacy, receipt).costs).toBe(80);
  });
});
