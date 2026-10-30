import { describe, expect, it } from "vitest";
import {
  fundedCashIncome,
  fundedDemandThrottle,
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

describe("funded demand throttle", () => {
  it("reads the share of capacity the funded settlement sold", () => {
    expect(fundedDemandThrottle(25, 100)).toBe(0.25);
    expect(fundedDemandThrottle(100, 100)).toBe(1);
  });

  it("clamps a multi-output plant's combined sales at full capacity", () => {
    expect(fundedDemandThrottle(120, 100)).toBe(1);
    expect(fundedDemandThrottle(-5, 100)).toBe(0);
  });

  it("reads 1 when the plant could produce nothing", () => {
    expect(fundedDemandThrottle(0, 0)).toBe(1);
    expect(fundedDemandThrottle(10, Number.NaN)).toBe(1);
    expect(fundedDemandThrottle(Number.NaN, 100)).toBe(0);
  });
});

describe("funded sector result keeps policy costs", () => {
  it("charges regulatory compliance on the revenue the plant sold", () => {
    const r = fundedSectorResult({ ...legacy, fundedRegulatoryBurdenRate: 0.05 }, receipt);
    // receipt costs 70 + growth 10 + 5% of the 100 sold, not of the legacy 500
    expect(r.costs).toBeCloseTo(85);
    expect(r.regulatoryBurden).toBeCloseTo(5);
    expect(r.fundedComplianceCost).toBeCloseTo(5);
  });

  it("does not charge the legacy pass's compliance figure", () => {
    // A dominant sector: the legacy pass priced 5% of its own 500 revenue.
    const r = fundedSectorResult({ ...legacy, regulatoryBurden: 25 }, receipt);
    expect(r.costs).toBe(80);
    expect(r.regulatoryBurden).toBe(0);
  });

  it("realizes growth cost against the funded revenue", () => {
    const r = fundedSectorResult(
      {
        ...legacy,
        hourlyGrowthCost: 10,
        nameplateHourlyGrowthCost: 20,
        nameplateHourlyRevenue: 1000,
        growthInvestmentAnchor: 10,
      },
      receipt
    );
    // 20 at full realization x 100 / 1000 sold
    expect(r.hourlyGrowthCost).toBeCloseTo(2);
    expect(r.growthInvestmentAnchor).toBeCloseTo(2);
    expect(r.costs).toBeCloseTo(72);
  });

  it("books compliance on its own plantsPnl line", () => {
    const result = fundedSectorResult({ ...legacy, fundedRegulatoryBurdenRate: 0.05 }, receipt);
    const out = fundedSectorOps(
      [{ updateOne: { filter: { _id: "s1" }, update: { $set: { wageLevel: 1 } } } }],
      "s1",
      receipt,
      result,
      (a) => a * 24,
      24
    );
    const set = (out[0].updateOne.update as { $set: Record<string, unknown> }).$set;
    expect(set.plantsPnl).toMatchObject({ compliance: 120, totalCost: 2040 });
  });

  it("records the dominance penalty the funded turn applied", () => {
    const result = fundedSectorResult({ ...legacy, fundedDominancePenaltyPp: 0 }, receipt);
    const out = fundedSectorOps(
      [
        {
          updateOne: {
            filter: { _id: "s1" },
            update: { $set: { dominanceMarginPenaltyPp: -6.52 } },
          },
        },
      ],
      "s1",
      receipt,
      result,
      (a) => a * 24,
      24
    );
    const set = (out[0].updateOne.update as { $set: Record<string, unknown> }).$set;
    expect(set.dominanceMarginPenaltyPp).toBe(0);
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
