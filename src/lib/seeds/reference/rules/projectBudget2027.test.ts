import { describe, expect, it } from "vitest";
import { projectBudget2027, type NationalFigures2027 } from "./projectBudget2027";

const row = {
  population: 10_000_000,
  gdp: 1_000,
  otherRevenue: 20,
  debt: { principal: 500, ceiling: 600, interestRate: 0.01 },
  baselineSpendingByCategory: { defense: 20, health: 100, other: 80 },
  baselineStateGrants: 50,
  economicFactors: { gdpGrowth: 1, wageGrowth: 2, inflationRate: 1, tradeGrowth: 3 },
  policyRevenueConfigs: [{ annualRevenuePerCapitaByOptionIndex: [10, 20] }],
};

const figures: NationalFigures2027 = {
  population: 12_500_000,
  gdp: 2_000,
  grossDebt: 80,
  realGrowth: 2,
  inflation: 3,
  fiscal: { revenue: 44, expenditure: 50, primaryBalance: -2, overallBalance: -4 },
  reference: { year: 2019, revenue: 40, expenditure: 40, primaryBalance: 0, overallBalance: -1 },
};

describe("projectBudget2027", () => {
  it("sets size, debt and interest from the national figures", () => {
    const projected = projectBudget2027(row, figures, 0.3);
    expect(projected.gdp).toBe(2_000);
    expect(projected.population).toBe(12_500_000);
    expect(projected.debt.principal).toBeCloseTo(1_600);
    expect(projected.debt.ceiling).toBeCloseTo(1_920);
    expect(projected.debt.interestRate).toBe(0.025);
  });

  it("keeps the row's coverage of primary expenditure and its spending mix", () => {
    const projected = projectBudget2027(row, figures, 0.3);
    // 25% of GDP against 39% primary expenditure, carried to 48%.
    const total =
      Object.values(projected.baselineSpendingByCategory).reduce((a, b) => a + b, 0) +
      projected.baselineStateGrants;
    expect(total / 2_000).toBeCloseTo((0.25 / 39) * 48);
    expect(
      projected.baselineSpendingByCategory.health / projected.baselineSpendingByCategory.other
    ).toBeCloseTo(100 / 80);
  });

  it("puts the revenue ratio change in other revenue and floors it at zero", () => {
    expect(projectBudget2027(row, figures, 0.3).otherRevenue).toBeCloseTo(40 + 0.1 * 0.3 * 2_000);
    const falling = { ...figures, fiscal: { ...figures.fiscal, revenue: 20 } };
    expect(projectBudget2027(row, falling, 0.3).otherRevenue).toBe(0);
  });

  it("pins a sourced category and fills the rest with the mix", () => {
    const pinned = { ...figures, pinnedCategory: { key: "defense", amount: 70 } };
    const projected = projectBudget2027(row, pinned, 0.3);
    expect(projected.baselineSpendingByCategory.defense).toBe(70);
    expect(() =>
      projectBudget2027(row, { ...figures, pinnedCategory: { key: "space", amount: 1 } }, 0.3)
    ).toThrow(/space/);
  });

  it("takes growth and inflation from the figures and keeps per-head revenue a share of income", () => {
    const projected = projectBudget2027(row, figures, 0.3);
    expect(projected.economicFactors).toMatchObject({
      gdpGrowth: 2,
      inflationRate: 3,
      wageGrowth: 4,
      tradeGrowth: 3,
    });
    // Income per head rises 1.6x: GDP doubles, population grows 1.25x.
    expect(projected.policyRevenueConfigs?.[0].annualRevenuePerCapitaByOptionIndex).toEqual([
      16, 32,
    ]);
  });
});
