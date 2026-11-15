import type { NationalBudgetSeedConfig } from "@/lib/seeds/reference/budgets";
import { COUNTRY_POLICY_CONFIGS } from "@/lib/seeds/reference/basePolicies";

// ── East Germany FY1979 — GDR state plan budget (Mark der DDR) ───────────────
// ~1979: net material product ≈ M 180B; full-employment planned economy,
// heavy consumer/rent subsidies, growing hidden hard-currency debt to the West.
export const DD_NATIONAL_BUDGET_1979: NationalBudgetSeedConfig = {
  budgetId: "DD",
  countryId: "DD",
  fiscalYear: 1979,
  population: 16_700_000,
  gdp: 180_000_000_000, // ≈ M 180B (net material product basis)
  currencyCode: "DDM",
  economicFactors: {
    gdpGrowth: 2.5,
    wageGrowth: 3.5,
    inflationRate: 0.5, // administered prices
    tradeGrowth: 3.0,
    lastUpdated: new Date(0),
  },
  // Fiscal-budget scale, matching makeEasternBlocBudget: VEB profit
  // remittances + product levy land ~55% of NMP against ~58% authored spend —
  // not the prior footprint bases (corp 0.68, taxableSales 1.3) that produced
  // ~98% GDP revenue. GDR consumer/rent subsidies stay on the spend side.
  taxBaseRatios: {
    taxableIncome: 0.05, // low flat wage tax
    corporateProfits: 0.32, // VEB surplus remitted; fiscal claim, not whole NMP
    wagesAndSalaries: 0.4,
    importValue: 0.12,
    taxableSales: 0.75, // product-levy base; capped below 1.0
  },
  otherRevenue: Math.round(180_000_000_000 * 0.12), // direct VEB remittances + state property
  debt: {
    principal: 32_000_000_000, // incl. hidden hard-currency debt to the West
    interestRate: 0.05,
    ceiling: 60_000_000_000,
    ceilingLastRaisedYear: 1979,
  },
  creditRating: "A",
  baselineSpendingByCategory: {
    socialSecurity: Math.round(180_000_000_000 * 0.12),
    healthcare: Math.round(180_000_000_000 * 0.05),
    education: Math.round(180_000_000_000 * 0.06),
    defense: Math.round(180_000_000_000 * 0.05), // NVA + Stasi
    infrastructure: Math.round(180_000_000_000 * 0.18), // plan investment + consumer/rent subsidies
    other: Math.round(180_000_000_000 * 0.08),
  },
  baselineStateGrants: Math.round(180_000_000_000 * 0.06),
  policyDefaults: COUNTRY_POLICY_CONFIGS.dd.defaults,
  policyOptionOverrides: COUNTRY_POLICY_CONFIGS.dd.optionIndexes,
  taxPolicyIds: {
    incomeTax: "dd_income_tax",
    domesticCorporateTax: "dd_enterprise_levy",
    payrollTax: "dd_social_insurance",
    tariffs: "dd_foreign_trade",
    salesTax: "dd_product_tax",
  },
};
