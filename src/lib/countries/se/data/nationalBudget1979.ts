import type { NationalBudgetSeedConfig } from "@/lib/seeds/reference/budgets";
import { COUNTRY_POLICY_CONFIGS } from "@/lib/seeds/reference/basePolicies";

// ── Sweden FY1979 — the Swedish model state budget (kronor) ─────────────────
// ~1979: GDP ≈ kr 500B; very high tax-to-GDP, large welfare spend, modest debt.
export const SE_NATIONAL_BUDGET_1979: NationalBudgetSeedConfig = {
  budgetId: "SE",
  countryId: "SE",
  fiscalYear: 1979,
  population: 8_300_000,
  gdp: 500_000_000_000, // ≈ kr 500B
  currencyCode: "SEK",
  economicFactors: {
    gdpGrowth: 3.8,
    wageGrowth: 9.0,
    inflationRate: 7.2,
    tradeGrowth: 5.0,
    lastUpdated: new Date(0),
  },
  taxBaseRatios: {
    taxableIncome: 0.5, // very high direct-tax base
    corporateProfits: 0.06,
    wagesAndSalaries: 0.55, // high employer fees
    importValue: 0.28,
    taxableSales: 0.5,
  },
  otherRevenue: 30_000_000_000,
  debt: {
    principal: 150_000_000_000, // ≈ 30% of GDP
    interestRate: 0.09,
    ceiling: 220_000_000_000,
    ceilingLastRaisedYear: 1979,
  },
  creditRating: "AAA",
  baselineSpendingByCategory: {
    socialSecurity: 70_000_000_000, // pensions + universal benefits
    healthcare: 40_000_000_000,
    education: 30_000_000_000,
    defense: 15_000_000_000, // sizeable neutral-armed-forces budget
    infrastructure: 25_000_000_000,
    other: 30_000_000_000,
  },
  baselineStateGrants: 55_000_000_000, // large transfers to municipalities/county councils
  policyDefaults: COUNTRY_POLICY_CONFIGS.se.defaults,
  policyOptionOverrides: COUNTRY_POLICY_CONFIGS.se.optionIndexes,
  taxPolicyIds: {
    incomeTax: "se_income_tax",
    domesticCorporateTax: "se_corporate_tax",
    payrollTax: "se_social_charges",
    tariffs: "se_customs_tariff",
    salesTax: "se_vat",
  },
};
