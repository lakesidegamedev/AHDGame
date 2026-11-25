import { describe, expect, it } from "vitest";
import {
  fundedCashIncome,
  fundedDemandThrottle,
  fundedInputThroughput,
  fundedSectorOps,
  fundedSectorOpsAll,
  fundedSectorResult,
  SETTLEMENT_OWNED_SECTOR_FIELDS,
} from "./fundedSectorRules";

const legacy = { hourlyRevenue: 500, effectiveMargin: 40, costs: 300, hourlyGrowthCost: 10, x: 1 };
const receipt = { turn: 12, revenue: 100, profit: 30, producedUnits: 12.345, soldUnits: 10 };

describe("funded sector result", () => {
  it("keeps management allocations out of tax, salary, growth and valuation bases", () => {
    const base = {
      ...legacy,
      fundedRegulatoryBurdenRate: 0.1,
      fundedSizeCostPp: 5,
      nameplateHourlyRevenue: 500,
      nameplateHourlyGrowthCost: 10,
    };
    const free = fundedSectorResult(base, receipt);
    for (const allocations of [
      { internalSupplyIncome: 300 },
      { internalSupplyCharge: 300 },
      { internalSupplyIncome: 20, internalSupplyCharge: 5 },
    ]) {
      expect(fundedSectorResult(base, { ...receipt, ...allocations })).toEqual(free);
    }
  });
  it("takes revenue and producer costs from the receipt and keeps growth spend", () => {
    const r = fundedSectorResult(legacy, receipt);
    expect(r.hourlyRevenue).toBe(100);
    expect(r.costs).toBe(80);
    expect(r.effectiveMargin).toBeCloseTo(20);
    expect(r.x).toBe(1);
  });

  it("names the wage, input, site and overhead legs the company's cost record reads", () => {
    const r = fundedSectorResult(
      { ...legacy, fundedSizeCostPp: 5 },
      { ...receipt, inputsConsumed: 20, labour: 30, siteOperating: 8 }
    );
    expect(r.costParts).toEqual({
      wages: 30,
      inputs: 20,
      maintenance: 8,
      managementOverhead: 5,
      dominanceCost: 0,
      freight: 0,
    });
    // The named legs never exceed the costs the sector booked.
    const named = Object.values(r.costParts!).reduce((n, v) => n + v, 0);
    expect(named).toBeLessThanOrEqual(r.costs + 1e-9);
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
            // The legacy gauge, pinned at its governor floor: the receipt owns it.
            throughputFactor: 0.85,
            throughputBindingInput: "freight",
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

  it("persists internal allocations on the same daily money basis as the site P&L", () => {
    const priced = { ...receipt, internalSupplyIncome: 20, internalSupplyCharge: 5 };
    const result = fundedSectorResult(legacy, priced);
    const out = fundedSectorOps(ops, "s1", priced, result, (a) => a * 24, 24);
    expect(out[0].updateOne.update.$set).toMatchObject({
      plantsPnl: {
        internalSupplyIncome: 480,
        internalSupplyCharge: 120,
      },
    });
  });

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
    expect(main.$set.plantsPnl).toMatchObject({
      turn: 12,
      revenue: 2400,
      profit: 480,
      totalCost: 1920,
    });
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

describe("funded input throughput", () => {
  it("reads the input-cut run share and the scarcest input", () => {
    expect(
      fundedInputThroughput({ billedRunShare: 0.4321, runCutBy: ["inputs"], bindingInput: "iron" })
    ).toEqual({ throughputFactor: 0.432, throughputBindingInput: "iron" });
  });

  it("reports a plant whose inputs all arrived as unconstrained", () => {
    // An own-site freight fill covered the whole order: no run cut, no gauge.
    expect(fundedInputThroughput({})).toEqual({
      throughputFactor: 1,
      throughputBindingInput: null,
    });
    expect(fundedInputThroughput(null)).toEqual({
      throughputFactor: 1,
      throughputBindingInput: null,
    });
  });

  it("does not count a cash cut as an input shortage", () => {
    expect(fundedInputThroughput({ billedRunShare: 0.5, runCutBy: ["cash"] })).toEqual({
      throughputFactor: 1,
      throughputBindingInput: null,
    });
  });

  it("clamps and keeps a cut without a named input", () => {
    expect(fundedInputThroughput({ billedRunShare: -1, runCutBy: ["cash", "inputs"] })).toEqual({
      throughputFactor: 0,
      throughputBindingInput: null,
    });
    expect(fundedInputThroughput({ billedRunShare: Number.NaN, runCutBy: ["inputs"] })).toEqual({
      throughputFactor: 1,
      throughputBindingInput: null,
    });
  });
});

describe("funded sector result keeps policy costs", () => {
  it("charges regulatory compliance on the revenue the plant sold", () => {
    const r = fundedSectorResult(
      { ...legacy, fundedRegulatoryBurdenRate: 0.05 },
      receipt
    ) as unknown as { costs: number; regulatoryBurden: number; fundedComplianceCost: number };
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

describe("funded sector ops store recent settled profit", () => {
  const ops = [{ updateOne: { filter: { _id: "s1" }, update: { $set: { revenue: 9 } } } }];
  const result = fundedSectorResult(legacy, receipt);

  it("writes the valuation history when the valuation produced one", () => {
    const history = [
      { turn: 11, profit: 20 },
      { turn: 12, profit: 30 },
    ];
    const out = fundedSectorOpsAll(
      ops,
      new Map([
        ["s1", { receipt, result, daily: (a: number) => a, valuationProfitHistory: history }],
      ]),
      24
    );
    expect(out[0].updateOne.update.$set).toMatchObject({ valuationProfitHistory: history });
  });

  it("leaves the stored history alone when the valuation did not run", () => {
    const out = fundedSectorOpsAll(
      ops,
      new Map([["s1", { receipt, result, daily: (a: number) => a }]]),
      24
    );
    expect(out[0].updateOne.update.$set).not.toHaveProperty("valuationProfitHistory");
  });
});

describe("funded revenue effects", () => {
  const withEffects = {
    ...legacy,
    fundedRevenueLegs: { homeLocation: 5, regulatoryBurden: -10 },
    fundedSubsidyPp: 7.5,
  };

  it("adds each effect to the sold revenue as its own line, and the lines add up", () => {
    const r = fundedSectorResult(withEffects, receipt);
    expect(r.fundedSalesRevenue).toBe(100);
    expect(r.fundedRevenueEffects?.map((l) => [l.key, l.amount])).toEqual([
      ["homeLocation", 5],
      ["regulatoryBurden", -10],
    ]);
    expect(r.hourlyRevenue).toBe(95);
  });

  it("keeps producer costs on sold revenue so the effects land on profit", () => {
    const r = fundedSectorResult(withEffects, receipt);
    expect(r.costs).toBe(70 + 10 * Math.min(1, 1));
    expect(r.hourlyRevenue - r.costs).toBe(95 - 80);
  });

  it("pays the subsidy on its own line, outside revenue", () => {
    const r = fundedSectorResult(withEffects, receipt);
    expect(r.fundedSubsidyReceived).toBe(7.5);
    expect(r.hourlyRevenue).toBe(95);
  });

  it("names the monopoly charge as a revenue effect", () => {
    const r = fundedSectorResult(withEffects, receipt);
    expect(r.fundedRevenueEffects?.find((l) => l.key === "regulatoryBurden")?.label).toBe(
      "Monopoly charge"
    );
  });

  it("raises operating costs, not revenue, for the dominance cost", () => {
    const base = fundedSectorResult(legacy, receipt);
    const dominated = fundedSectorResult({ ...legacy, fundedDominanceCostPct: 10 }, receipt);
    expect(dominated.hourlyRevenue).toBe(base.hourlyRevenue);
    const producerCosts = 100 - receipt.profit;
    expect(dominated.costParts.dominanceCost).toBeCloseTo(producerCosts * 0.1, 8);
    expect(dominated.costs - base.costs).toBeCloseTo(producerCosts * 0.1, 8);
  });

  it("leaves the result unchanged when revenue effects are off", () => {
    const r = fundedSectorResult(legacy, receipt);
    expect(r.hourlyRevenue).toBe(100);
    expect(r.fundedRevenueEffects).toBeUndefined();
    expect(r.fundedSubsidyReceived).toBeUndefined();
  });

  it("stamps sales, named effects and the subsidy on plantsPnl", () => {
    const result = fundedSectorResult(withEffects, receipt);
    const out = fundedSectorOpsAll(
      [{ updateOne: { filter: { _id: "s1" }, update: { $set: { wageLevel: 1 } } } }],
      new Map([["s1", { receipt, result, daily: (a: number) => a * 2 }]]),
      24
    );
    const pnl = (out[0].updateOne.update.$set as { plantsPnl: Record<string, unknown> }).plantsPnl;
    expect(pnl).toMatchObject({
      revenue: 190,
      salesRevenue: 200,
      subsidyReceived: 15,
      revenueEffects: [
        { key: "homeLocation", amount: 10 },
        { key: "regulatoryBurden", amount: -20 },
      ],
    });
  });
});
