import { describe, expect, it } from "vitest";
import { numericLeaves, numericSimilarity } from "./similarity";
import { isCurrencyValidAt } from "./currencyValidity";
import {
  checkBudgetScale,
  checkCommodityPriceLevel,
  checkDollarIncome,
  checkRegionalTotals,
  type BudgetScaleInput,
} from "./scale";

const budget = (overrides: Partial<BudgetScaleInput> = {}): BudgetScaleInput => ({
  countryId: "XX",
  gdp: 1_000,
  population: 10,
  spendingByCategory: { health: 100, defence: 50 },
  stateGrants: 50,
  debtPrincipal: 600,
  revenuePerCapitaByLaw: {},
  ...overrides,
});

describe("duplicate guard", () => {
  it("keys roster rows by id so order does not matter", () => {
    const a = [
      { _id: "A", population: 1 },
      { _id: "B", population: 2 },
    ];
    expect(numericSimilarity(a, [...a].reverse())).toBe(1);
    expect([...numericLeaves(a).keys()]).toEqual(["[A].population", "[B].population"]);
  });

  it("ignores strings and measures the share of equal numbers", () => {
    const a = { name: "x", v: [1, 2, 3, 4] };
    expect(numericSimilarity(a, { name: "y", v: [1, 2, 3, 5] })).toBe(0.75);
  });

  it("is zero when either side has no numbers", () => {
    expect(numericSimilarity({}, { v: 1 })).toBe(0);
  });
});

describe("scale guard", () => {
  it("passes a budget inside every band", () => {
    expect(checkBudgetScale(budget())).toEqual([]);
  });

  it("flags spending, debt and a programme out of band", () => {
    const checks = checkBudgetScale(
      budget({ spendingByCategory: { health: 900 }, debtPrincipal: 5_000 })
    ).map((f) => f.check);
    expect(checks).toEqual(["budgetSpending", "sovereignDebt", "programCostPerCapita"]);
  });

  it("flags a law raising more per head than half of income", () => {
    const findings = checkBudgetScale(budget({ revenuePerCapitaByLaw: { tax: [10, 60] } }));
    expect(findings.map((f) => f.check)).toEqual(["lawRevenuePerCapita"]);
  });

  it("compares dollar income with the US in the same preset", () => {
    const us = budget({ countryId: "US", lcuPerUsd: 1 });
    const ok = budget({ countryId: "AA", lcuPerUsd: 2 });
    const wrongUnits = budget({ countryId: "BB", lcuPerUsd: 10_000 });
    expect(checkDollarIncome([us, ok, wrongUnits]).map((f) => f.countryId)).toEqual(["BB"]);
  });

  it("checks regional totals against national totals", () => {
    const base = {
      countryId: "XX",
      nationalGdp: 1_000_000_000,
      nationalPopulation: 100,
      regionalGdpMillions: 1_000,
      regionalPopulation: 100,
      gdpReconciledAtSeed: false,
    };
    expect(checkRegionalTotals(base)).toEqual([]);
    expect(checkRegionalTotals({ ...base, regionalGdpMillions: 10 }).map((f) => f.check)).toEqual([
      "regionalGdp",
    ]);
    expect(
      checkRegionalTotals({ ...base, regionalGdpMillions: 10, gdpReconciledAtSeed: true })
    ).toEqual([]);
    expect(checkRegionalTotals({ ...base, regionalPopulation: 50 }).map((f) => f.check)).toEqual([
      "regionalPopulation",
    ]);
  });

  it("checks commodity prices against the era price level", () => {
    expect(checkCommodityPriceLevel(1, 1.2)).toEqual([]);
    expect(checkCommodityPriceLevel(1, 0.36)).toHaveLength(1);
  });
});

describe("currency validity", () => {
  it.each([
    ["SUR", 1991, true],
    ["SUR", 1999, false],
    ["RUB", 1999, true],
    ["FRF", 1999, true],
    ["FRF", 2019, false],
    ["EUR", 2027, true],
    ["BGN", 2027, false],
    ["TRY", 2027, true],
    ["USD", 1953, true],
  ])("%s in %i is %s", (code, year, valid) => {
    expect(isCurrencyValidAt(code, year)).toBe(valid);
  });
});
