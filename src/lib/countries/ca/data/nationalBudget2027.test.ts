import { describe, expect, it } from "vitest";
import { caRegions2027 } from "./caRegions2027";
import { CA_NATIONAL_BUDGET_2027 } from "./nationalBudget2027";
import {
  buildNationalBudgetSeed,
  getAuthoredNationalSpending,
  getNationalBudgetSeedConfigsForPreset,
} from "@/lib/seeds/reference/budgets";
import { getCatalog } from "@/lib/politicalLegislation/catalog";
import { budgetKeyForLaw } from "@/lib/politicalLegislation/budgetKeys";
import { SEED_TAX_RATES_1953 } from "@/lib/politicalLegislation/seedTaxRates";
import { tierFor } from "@/lib/world/eraRoster";

const row = CA_NATIONAL_BUDGET_2027;
const seeded = buildNationalBudgetSeed(row);

describe("Canada 2027 national budget", () => {
  it("is an authored 2027 row in Canadian dollars", () => {
    expect(row.fiscalYear).toBe(2027);
    expect(row.sourceFiscalYear).toBeUndefined();
    expect(row.currencyCode).toBe("CAD");
  });

  it("seeds in the 2027 world exactly when the roster includes Canada", () => {
    const present = getNationalBudgetSeedConfigsForPreset("2027-default").some(
      (config) => config.countryId === "CA"
    );
    expect(present).toBe(tierFor("2027-default", "CA") !== "absent");
  });

  it("matches the provincial rollup for population and GDP", () => {
    expect(caRegions2027.reduce((sum, r) => sum + r.population, 0)).toBe(row.population);
    const regionalGdp = caRegions2027.reduce((sum, r) => sum + r.gdp, 0) * 1_000_000;
    expect(Math.abs(regionalGdp / row.gdp - 1)).toBeLessThan(0.001);
  });

  it("opens on the law book's tax rates", () => {
    for (const [tax, rate] of Object.entries(SEED_TAX_RATES_1953.CA)) {
      expect(seeded.taxRates[tax as keyof typeof seeded.taxRates]).toBe(rate);
    }
  });

  it("puts revenue near 40% and spending near 42% of GDP", () => {
    expect(seeded.revenue.total / seeded.gdp).toBeGreaterThan(0.39);
    expect(seeded.revenue.total / seeded.gdp).toBeLessThan(0.41);
    expect(seeded.spending.total / seeded.gdp).toBeGreaterThan(0.41);
    expect(seeded.spending.total / seeded.gdp).toBeLessThan(0.43);
    expect(seeded.spending.byCategory.defense / seeded.gdp).toBeCloseTo(0.02, 4);
  });

  it("authors a target for every budget key the opening law book books", () => {
    const authored = getAuthoredNationalSpending("CA", 2027)!;
    const keys = new Set(
      getCatalog("CA", 2027)
        .filter((law) => law.kind !== "tax" && law.allowedScope !== "regional")
        .filter((law) => (law.baselineLevel ?? 0) > 0)
        .map((law) => budgetKeyForLaw(law))
    );
    for (const key of keys) expect(authored[key], key).toBeGreaterThan(0);
  });
});
