import { describe, expect, it, vi } from "vitest";
import type { Db } from "mongodb";
import type { FederalBudget, FederalRevenue, FederalSpending } from "@/lib/db/types/budget";
import { createMockDb } from "@/lib/test-utils/mockDb";

vi.mock("@/lib/news", () => ({ createSystemNewsPost: vi.fn().mockResolvedValue(undefined) }));

import {
  applyFiscalStabilizer,
  fiscalConsolidationApprovalModifiers,
  loadFiscalConsolidationApprovalEffects,
  loadRulingEconomicPositions,
} from "./fiscalStabilizer";

function cursorOf<T>(data: T[]) {
  return { toArray: vi.fn().mockResolvedValue(data) };
}

/** Italy-like books in a 1,000-unit economy: primary deficit 11% of GDP. */
function italy(over: Partial<FederalBudget> = {}) {
  const budget = {
    _id: "IT",
    countryId: "IT",
    debtToGdpRatio: 1.4,
    taxRates: {
      incomeTax: 25,
      incomeTaxLow: 20,
      incomeTaxMiddle: 25,
      incomeTaxHigh: 35,
      salesTax: 19,
      payrollTax: 10,
      domesticCorporateTax: 30,
      foreignCorporateTax: 30,
      tariffs: 5,
    },
    ...over,
  } as unknown as FederalBudget;
  const revenue = {
    incomeTax: 120,
    salesTax: 80,
    payrollTax: 30,
    domesticCorporateTax: 20,
    foreignCorporateTax: 10,
    tariffs: 5,
    total: 265,
  } as unknown as FederalRevenue;
  const spending: FederalSpending = {
    byCategory: { healthcare: 120, social: 160, education: 65, defense: 30 },
    stateGrants: 0,
    debtInterest: 196,
    total: 571,
  };
  return { budget, revenue, spending };
}

describe("applyFiscalStabilizer", () => {
  it("cuts spending now, ramps taxes through phase-in targets and records the package", () => {
    const { budget, revenue, spending } = italy();
    const out = applyFiscalStabilizer({
      budget,
      revenue,
      spending,
      gdp: 1000,
      debtToGdpRatio: 1.5,
      rulingEconomicPosition: 0,
      fiscalYear: 2006,
      currentTurn: 760,
    });
    expect(out.package).not.toBeNull();
    const record = out.package!;
    expect(record.primaryBalanceGdpShare).toBeCloseTo(-0.11);
    // Distressed (BB band, growth penalty) and rising: aims for balance.
    expect(record.targetPrimaryBalanceGdpShare).toBe(0);
    expect(record.size).toBeCloseTo(110 / 3);
    // Spending falls by the cut at once; defence and interest are untouched.
    expect(out.spending.total).toBeCloseTo(spending.total - record.spendingCut);
    expect(out.spending.byCategory.defense).toBe(30);
    expect(out.spending.debtInterest).toBe(196);
    // Taxes ramp through the ordinary phase-in path, never an instant jump.
    expect(out.set["taxRatePhaseIn.salesTax"]).toBeGreaterThan(19);
    expect(out.set["taxRatePhaseIn.incomeTaxHigh"]).toBeGreaterThan(35);
    expect(out.set["taxRatePhaseIn.tariffs"]).toBeUndefined();
    expect(out.set["fiscalConsolidation.lastPackage"]).toBe(record);
    expect(out.set["fiscalConsolidation.categoryScale"]).toMatchObject({
      healthcare: expect.any(Number),
    });
    // Interest is 74% of revenue: first spiral year.
    expect(out.interestSpiralYears).toBe(1);
    expect(out.set["fiscalConsolidation.interestSpiralYears"]).toBe(1);
  });

  it("builds on an earlier package's scale and spiral count", () => {
    const { budget, revenue, spending } = italy({
      fiscalConsolidation: { categoryScale: { healthcare: 0.9 }, interestSpiralYears: 1 },
    });
    const out = applyFiscalStabilizer({
      budget,
      revenue,
      spending,
      gdp: 1000,
      debtToGdpRatio: 1.5,
      rulingEconomicPosition: 1,
      fiscalYear: 2007,
      currentTurn: 808,
    });
    const scale = out.set["fiscalConsolidation.categoryScale"] as Record<string, number>;
    expect(scale.healthcare).toBeLessThan(0.9);
    expect(out.interestSpiralYears).toBe(2);
  });

  it("only counts the spiral while crisis austerity already caps spending", () => {
    const { budget, revenue, spending } = italy();
    const out = applyFiscalStabilizer({
      budget,
      revenue,
      spending,
      gdp: 1000,
      debtToGdpRatio: 1.5,
      rulingEconomicPosition: 0,
      fiscalYear: 2006,
      currentTurn: 760,
      consolidate: false,
    });
    expect(out.package).toBeNull();
    expect(out.spending).toBe(spending);
    expect(Object.keys(out.set)).toEqual(["fiscalConsolidation.interestSpiralYears"]);
  });

  it("enacts nothing for a country inside the floor", () => {
    const { budget, revenue } = italy();
    const spending: FederalSpending = {
      byCategory: { healthcare: 100, social: 100, education: 50, defense: 30 },
      stateGrants: 0,
      debtInterest: 20,
      total: 300,
    };
    const out = applyFiscalStabilizer({
      budget: { ...budget, debtToGdpRatio: 0.5 },
      revenue,
      spending,
      gdp: 1000,
      debtToGdpRatio: 0.5,
      rulingEconomicPosition: 0,
      fiscalYear: 2006,
      currentTurn: 760,
    });
    expect(out.package).toBeNull();
    expect(out.interestSpiralYears).toBe(0);
  });
});

describe("loadRulingEconomicPositions", () => {
  it("scales the governing party's position to [-1, 1] in two batched reads", async () => {
    const db = createMockDb();
    db.collection("governmentFormations").find.mockReturnValue(
      cursorOf([
        { _id: "IT", governingPartyId: "2" },
        { _id: "FR", governingPartyId: null },
      ])
    );
    db.collection("politicalParties").find.mockReturnValue(
      cursorOf([
        { countryId: "IT", sequentialId: 2, economicPosition: -2.5 },
        { countryId: "IT", sequentialId: 3, economicPosition: 5 },
      ])
    );
    const positions = await loadRulingEconomicPositions(db as unknown as Db, ["IT", "FR"]);
    expect(positions.get("IT")).toBe(-0.5);
    expect(positions.has("FR")).toBe(false);
    expect(db.collection("governmentFormations").find).toHaveBeenCalledTimes(1);
    expect(db.collection("politicalParties").find).toHaveBeenCalledTimes(1);
  });
});

describe("approval effect", () => {
  it("charges the package's approval cost, fading over a year", async () => {
    const db = createMockDb();
    db.collection("federalBudget").find.mockReturnValue(
      cursorOf([
        {
          _id: "IT",
          countryId: "IT",
          fiscalConsolidation: { lastPackage: { appliedTurn: 760, approvalCost: 2 } },
        },
      ])
    );
    const effects = await loadFiscalConsolidationApprovalEffects(db as unknown as Db, 760);
    expect(effects.get("IT")).toBe(-2);
    expect(fiscalConsolidationApprovalModifiers(effects.get("IT"))).toEqual([
      expect.objectContaining({ id: "fiscal_consolidation", effect: -2, source: "fiscal" }),
    ]);
    expect(fiscalConsolidationApprovalModifiers(undefined)).toEqual([]);
  });
});
