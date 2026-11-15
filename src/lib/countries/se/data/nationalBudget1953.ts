import type { NationalBudgetSeedConfig } from "@/lib/seeds/reference/budgets";
import { COUNTRY_POLICY_CONFIGS_1953 } from "@/lib/seeds/reference/basePolicies1953";

// ── Sweden FY1953 — the Swedish Model at full sail ───────────────────────────
// GDP ≈ kr 36B (~$7B; 5.17 SEK/USD); LO-SAF Saltsjöbaden accord; strong export
// surplus; folkpension universal (1913 → expanded 1946); neutral but well-armed.
export const SE_NATIONAL_BUDGET_1953: NationalBudgetSeedConfig = {
  budgetId: "SE",
  countryId: "SE",
  fiscalYear: 1953,
  population: 7_170_000,
  gdp: 36_000_000_000, // ≈ kr 36B
  currencyCode: "SEK",
  economicFactors: {
    gdpGrowth: 3.5,
    wageGrowth: 5.5,
    inflationRate: 2.5,
    tradeGrowth: 5.0,
    lastUpdated: new Date(0),
  },
  // Sweden's 1953 wage economy was more formalized than Finland's, so it keeps
  // a wider tax base than FI, but narrower ratios keep revenue consistent with
  // a folkhem under construction rather than a mature welfare state.
  taxBaseRatios: {
    taxableIncome: 0.35,
    corporateProfits: 0.05,
    wagesAndSalaries: 0.42,
    importValue: 0.22,
    taxableSales: 0.4,
  },
  otherRevenue: 1_500_000_000,
  debt: {
    principal: 6_000_000_000, // ~17% GDP; well-managed
    interestRate: 0.04,
    ceiling: 9_000_000_000,
    ceilingLastRaisedYear: 1953,
  },
  creditRating: "AAA",
  baselineSpendingByCategory: {
    socialSecurity: 3_800_000_000, // folkpension + universal child allowance (1947)
    healthcare: 1_500_000_000, // county-council universal coverage
    education: 1_200_000_000,
    defense: 2_000_000_000, // neutral but large armed forces; ~5.5% GDP
    infrastructure: 1_500_000_000,
    other: 1_200_000_000,
  },
  baselineStateGrants: 1_800_000_000, // large transfers to municipalities
  policyDefaults: COUNTRY_POLICY_CONFIGS_1953.se.defaults,
  policyOptionOverrides: COUNTRY_POLICY_CONFIGS_1953.se.optionIndexes,
  taxPolicyIds: {
    incomeTax: "se_income_tax",
    domesticCorporateTax: "se_corporate_tax",
    payrollTax: "se_social_charges",
    tariffs: "se_customs_tariff",
    salesTax: "se_vat",
  },
};
