import type { NationalBudgetSeedConfig } from "@/lib/seeds/reference/budgets";
import { POPULATION_TOTALS_1991 } from "@/lib/seeds/reference/populationTotals1991";
import { COUNTRY_POLICY_CONFIGS_1991 } from "@/lib/seeds/reference/basePolicies1991";

// ── Nigeria — Babangida-era SAP (1991 baseline) ────────────────────────────
// 1991 Nigeria was under military rule (Babangida), mid-Structural Adjustment
// Programme. Oil revenue dominant; naira devalued heavily post-1986 SAP. GDP
// The legacy ₦1.8T model is rebased to the observed national anchor in
// getNationalBudgetSeedConfigsForPreset, preserving its fiscal shares. Figures are
// plausible game-units rather than precise fiscal records (federal budgets
// under military rule were opaque and heavily revised).
export const NG_NATIONAL_BUDGET_1991: NationalBudgetSeedConfig = {
  budgetId: "NG",
  countryId: "NG",
  fiscalYear: 1991,
  population: POPULATION_TOTALS_1991.NG.population,
  gdp: 1_800_000_000_000, // ₦1.8T NGN (1991 current prices, post-SAP naira)
  currencyCode: "NGN",
  economicFactors: {
    gdpGrowth: 1.5, // SAP contraction easing
    wageGrowth: 15.0, // indexed against high inflation
    inflationRate: 20.0, // SAP-driven
    tradeGrowth: -1.0,
    lastUpdated: new Date(),
  },
  taxBaseRatios: {
    taxableIncome: 0.03,
    corporateProfits: 0.04,
    wagesAndSalaries: 0.2,
    importValue: 0.2,
    taxableSales: 0.25,
  },
  otherRevenue: 120_000_000_000, // oil rents (post-SAP naira)
  debt: {
    principal: 400_000_000_000,
    interestRate: 0.18, // high post-SAP borrowing costs
    ceiling: 600_000_000_000,
    ceilingLastRaisedYear: 1991,
  },
  creditRating: "B",
  baselineSpendingByCategory: {
    socialSecurity: 30_000_000_000,
    healthcare: 15_000_000_000,
    education: 25_000_000_000,
    defense: 40_000_000_000,
    infrastructure: 35_000_000_000,
    welfare: 10_000_000_000,
    other: 50_000_000_000,
  },
  baselineStateGrants: 20_000_000_000,
  policyDefaults: COUNTRY_POLICY_CONFIGS_1991.ng.defaults,
  policyOptionOverrides: COUNTRY_POLICY_CONFIGS_1991.ng.optionIndexes,
  taxPolicyIds: {
    incomeTax: "ng_personal_income_tax",
    domesticCorporateTax: "ng_companies_income_tax",
    foreignCorporateTax: "ng_petroleum_profit_tax",
    payrollTax: "ng_paye",
    salesTax: "ng_vat_rate",
  },
};
