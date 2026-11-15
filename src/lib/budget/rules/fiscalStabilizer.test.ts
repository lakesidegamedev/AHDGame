import { describe, expect, it } from "vitest";
import {
  MAX_CATEGORY_CUT_PER_YEAR,
  MAX_TAX_RATE_RISE_POINTS,
  MIN_CATEGORY_SCALE,
  applyCategoryScale,
  fiscalConsolidationApprovalCost,
  fiscalConsolidationApprovalEffect,
  nextInterestSpiralYears,
  planFiscalConsolidation,
  plannedTaxShare,
  primaryBalanceGdpShare,
  shouldRestructureForInterest,
  type FiscalStabilizerInput,
} from "./fiscalStabilizer";

const CALM = { gdpPenalty: 0 };
const DISTRESSED = { gdpPenalty: 0.7 };

/** A 1,000-unit economy with broad tax lines and a spread of spending. */
function input(over: Partial<FiscalStabilizerInput> = {}): FiscalStabilizerInput {
  return {
    gdp: 1000,
    revenueTotal: 300,
    spendingTotal: 500,
    debtInterest: 20,
    debtToGdpRatio: 0.5,
    previousDebtToGdpRatio: 0.5,
    debtThreshold: CALM,
    rulingEconomicPosition: 0,
    spendingByCategory: { healthcare: 120, education: 100, social: 110, defense: 50 },
    taxLines: [
      { revenue: 150, rates: { incomeTaxLow: 10, incomeTaxMiddle: 20, incomeTaxHigh: 30 } },
      { revenue: 100, rates: { salesTax: 20 } },
      { revenue: 50, rates: { payrollTax: 10 } },
    ],
    ...over,
  };
}

describe("primaryBalanceGdpShare", () => {
  it("excludes debt interest from spending", () => {
    // 300 revenue - (500 - 20) primary spending = -180 on 1,000 GDP.
    expect(primaryBalanceGdpShare(input())).toBeCloseTo(-0.18);
  });

  it("is null without a usable GDP", () => {
    expect(primaryBalanceGdpShare(input({ gdp: 0 }))).toBeNull();
  });
});

describe("planFiscalConsolidation sizing", () => {
  it("enacts nothing when the primary balance is above the -3% floor", () => {
    // Primary -2%.
    expect(planFiscalConsolidation(input({ spendingTotal: 340 }))).toBeNull();
  });

  it("enacts nothing for a balanced budget even with distressed rising debt", () => {
    expect(
      planFiscalConsolidation(
        input({
          spendingTotal: 320,
          debtThreshold: DISTRESSED,
          debtToGdpRatio: 2,
          previousDebtToGdpRatio: 1.9,
        })
      )
    ).toBeNull();
  });

  it("closes one third of the gap above the -3% floor", () => {
    const plan = planFiscalConsolidation(input())!;
    // Primary -18%, floor -3%: gap 15% of GDP, package 5%.
    expect(plan.targetPrimaryBalanceGdpShare).toBe(-0.03);
    expect(plan.sizeGdpShare).toBeCloseTo(0.05);
    expect(plan.size).toBeCloseTo(50);
    expect(plan.taxRise + plan.spendingCut).toBeCloseTo(plan.size);
    expect(plan.unfunded).toBeCloseTo(0);
  });

  it("aims for primary balance while debt is above the threshold and rising", () => {
    const plan = planFiscalConsolidation(
      input({ debtThreshold: DISTRESSED, debtToGdpRatio: 1.6, previousDebtToGdpRatio: 1.5 })
    )!;
    expect(plan.targetPrimaryBalanceGdpShare).toBe(0);
    expect(plan.sizeGdpShare).toBeCloseTo(0.06);
  });

  it("enacts at least 2% of GDP, or the whole gap when smaller", () => {
    // Primary -6%: gap 3% above the floor, a third is 1%, so the minimum applies.
    expect(planFiscalConsolidation(input({ spendingTotal: 380 }))!.sizeGdpShare).toBeCloseTo(0.02);
    // Primary -3.5%: the whole 0.5% gap closes in one year.
    expect(planFiscalConsolidation(input({ spendingTotal: 355 }))!.sizeGdpShare).toBeCloseTo(0.005);
  });

  it("keeps the -3% floor when distressed debt is falling", () => {
    const plan = planFiscalConsolidation(
      input({ debtThreshold: DISTRESSED, debtToGdpRatio: 1.4, previousDebtToGdpRatio: 1.5 })
    )!;
    expect(plan.targetPrimaryBalanceGdpShare).toBe(-0.03);
  });
});

describe("planFiscalConsolidation split by ideology", () => {
  it("splits half and half in the centre", () => {
    const plan = planFiscalConsolidation(input({ rulingEconomicPosition: 0 }))!;
    expect(plan.plannedTaxShare).toBe(0.5);
    expect(plan.taxRise).toBeCloseTo(plan.size / 2);
    expect(plan.spendingCut).toBeCloseTo(plan.size / 2);
  });

  it("leans on taxes on the left and cuts on the right", () => {
    const left = planFiscalConsolidation(input({ rulingEconomicPosition: -1 }))!;
    const right = planFiscalConsolidation(input({ rulingEconomicPosition: 1 }))!;
    expect(left.taxRise).toBeCloseTo(left.size * 0.75);
    expect(right.spendingCut).toBeCloseTo(right.size * 0.75);
    expect(plannedTaxShare(null)).toBe(0.5);
    expect(plannedTaxShare(-9)).toBe(0.75);
  });

  it("raises every rate in a line together, from the higher of current and pending", () => {
    const plan = planFiscalConsolidation(input({ rulingEconomicPosition: -1 }))!;
    const low = plan.taxRateTargets.incomeTaxLow / 10;
    expect(plan.taxRateTargets.incomeTaxHigh / 30).toBeCloseTo(low);
    expect(low).toBeGreaterThan(1);
  });
});

describe("planFiscalConsolidation caps", () => {
  it("never cuts defence, debt interest or protected obligations", () => {
    const plan = planFiscalConsolidation(
      input({
        rulingEconomicPosition: 1,
        spendingByCategory: { healthcare: 120, defense: 200, counterterrorism: 40 },
        protectedCategories: ["counterterrorism"],
      })
    )!;
    expect(plan.categoryCuts.defense).toBeUndefined();
    expect(plan.categoryCuts.counterterrorism).toBeUndefined();
    expect(Object.keys(plan.categoryCuts)).toEqual(["healthcare"]);
  });

  it("cuts no category more than 15% a year and moves the rest to taxes", () => {
    const plan = planFiscalConsolidation(
      input({
        revenueTotal: 100,
        spendingTotal: 400,
        rulingEconomicPosition: 1,
        spendingByCategory: { healthcare: 50, education: 50 },
      })
    )!;
    for (const cut of Object.values(plan.categoryCuts)) {
      expect(cut).toBeLessThanOrEqual(MAX_CATEGORY_CUT_PER_YEAR + 1e-12);
    }
    expect(plan.spendingCut).toBeCloseTo(15);
    expect(plan.taxRise).toBeGreaterThan(plan.size * 0.25);
  });

  it("stops cutting a category at half of its law-priced level", () => {
    const plan = planFiscalConsolidation(
      input({
        spendingByCategory: { healthcare: 120, education: 100 },
        categoryScale: { healthcare: MIN_CATEGORY_SCALE, education: 0.55 },
      })
    )!;
    expect(plan.categoryCuts.healthcare).toBeUndefined();
    expect(plan.categoryScale.education).toBeCloseTo(MIN_CATEGORY_SCALE);
  });

  it("raises no rate more than three points a year and reports what the caps leave unfunded", () => {
    const plan = planFiscalConsolidation(
      input({
        revenueTotal: 10,
        spendingTotal: 900,
        spendingByCategory: { healthcare: 10 },
        taxLines: [{ revenue: 10, rates: { salesTax: 10 } }],
      })
    )!;
    expect(plan.taxRateTargets.salesTax).toBeLessThanOrEqual(10 + MAX_TAX_RATE_RISE_POINTS);
    expect(plan.unfunded).toBeGreaterThan(0);
    expect(plan.taxRise + plan.spendingCut + plan.unfunded).toBeCloseTo(plan.size);
  });
});

describe("approval cost", () => {
  it("is small and proportional to the package, capped", () => {
    expect(fiscalConsolidationApprovalCost(0)).toBe(0);
    expect(fiscalConsolidationApprovalCost(2)).toBe(1.5);
    expect(fiscalConsolidationApprovalCost(20)).toBe(4);
  });

  it("fades to nothing over the fade window", () => {
    expect(fiscalConsolidationApprovalEffect(2, 0, 48)).toBe(-2);
    expect(fiscalConsolidationApprovalEffect(2, 24, 48)).toBe(-1);
    expect(fiscalConsolidationApprovalEffect(2, 48, 48)).toBe(0);
  });
});

describe("applyCategoryScale", () => {
  it("scales only listed positive categories", () => {
    expect(applyCategoryScale({ a: 100, b: 50, c: -10 }, { a: 0.8, c: 0.5 })).toEqual({
      a: 80,
      b: 50,
      c: -10,
    });
  });
});

describe("interest spiral", () => {
  it("counts consecutive years with interest above half of revenue and resets otherwise", () => {
    const one = nextInterestSpiralYears(0, { debtInterest: 60, revenueTotal: 100 });
    const two = nextInterestSpiralYears(one, { debtInterest: 60, revenueTotal: 100 });
    expect([one, two]).toEqual([1, 2]);
    expect(shouldRestructureForInterest(one)).toBe(false);
    expect(shouldRestructureForInterest(two)).toBe(true);
    expect(nextInterestSpiralYears(two, { debtInterest: 40, revenueTotal: 100 })).toBe(0);
  });
});

/**
 * Multi-year projection with the rule closing the loop: the package changes
 * next year's revenue and spending, the deficit adds to debt, and interest is
 * charged on the debt. Revenue is scored statically, as the rule assumes.
 */
function project(start: {
  gdp: number;
  revenue: number;
  primarySpending: number;
  debt: number;
  rate: number;
  rulingEconomicPosition: number;
  years: number;
}) {
  let { revenue, debt } = start;
  const gdp = start.gdp;
  const baseByCategory = {
    healthcare: start.primarySpending * 0.3,
    social: start.primarySpending * 0.35,
    education: start.primarySpending * 0.2,
    defense: start.primarySpending * 0.15,
  };
  let scale: Record<string, number> = {};
  let spiralYears = 0;
  let previousRatio: number | null = null;
  const history: Array<{ year: number; primaryBalance: number; restructured: boolean }> = [];
  for (let year = 1; year <= start.years; year++) {
    const byCategory = applyCategoryScale(baseByCategory, scale);
    const primarySpending = Object.values(byCategory).reduce((a, b) => a + b, 0);
    const interest = debt * start.rate;
    const ratio = debt / gdp;
    const primaryBalance = (revenue - primarySpending) / gdp;
    spiralYears = nextInterestSpiralYears(spiralYears, {
      debtInterest: interest,
      revenueTotal: revenue,
    });
    const restructured = shouldRestructureForInterest(spiralYears);
    history.push({ year, primaryBalance, restructured });
    if (restructured) break;
    const plan = planFiscalConsolidation({
      gdp,
      revenueTotal: revenue,
      spendingTotal: primarySpending + interest,
      debtInterest: interest,
      debtToGdpRatio: ratio,
      previousDebtToGdpRatio: previousRatio,
      debtThreshold: ratio > 0.8 ? DISTRESSED : CALM,
      rulingEconomicPosition: start.rulingEconomicPosition,
      spendingByCategory: byCategory,
      categoryScale: scale,
      taxLines: [
        { revenue: revenue * 0.5, rates: { incomeTaxMiddle: 25 } },
        { revenue: revenue * 0.5, rates: { salesTax: 19 } },
      ],
    });
    if (plan) {
      scale = plan.categoryScale;
      revenue += plan.taxRise;
    }
    debt += primarySpending + interest - revenue;
    previousRatio = ratio;
  }
  return history;
}

describe("Italy-shaped fixture (#5703)", () => {
  it("restructures within two fiscal years when interest dwarfs revenue", () => {
    // Live shape: revenue 652T, programme spending 925T, debt 11,081T at 14%,
    // GDP 2,455T. Interest alone is several times revenue.
    const history = project({
      gdp: 2455,
      revenue: 652,
      primarySpending: 925,
      debt: 11081,
      rate: 0.14,
      rulingEconomicPosition: 0,
      years: 5,
    });
    const restructuredIn = history.findIndex((row) => row.restructured) + 1;
    expect(restructuredIn).toBeGreaterThan(0);
    expect(restructuredIn).toBeLessThanOrEqual(2);
    // Before restructuring the package is already cutting the primary gap.
    expect(history[1].primaryBalance).toBeGreaterThan(history[0].primaryBalance);
  });

  it("an 11% primary deficit with serviceable debt either balances in five years or restructures", () => {
    const history = project({
      gdp: 2455,
      revenue: 652,
      primarySpending: 925,
      debt: 2455,
      rate: 0.05,
      rulingEconomicPosition: 0,
      // The opening close plus five fiscal years of packages.
      years: 6,
    });
    const restructured = history.some((row) => row.restructured);
    const last = history[history.length - 1];
    expect(restructured || last.primaryBalance >= -1e-9).toBe(true);
    // The deficit shrinks every year the package runs.
    for (let i = 1; i < history.length - 1; i++) {
      expect(history[i].primaryBalance).toBeGreaterThan(history[i - 1].primaryBalance);
    }
  });
});
