import type { NationalBudgetSeedConfig } from "@/lib/seeds/reference/budgets";
import { COUNTRY_POLICY_CONFIGS_1953 } from "@/lib/seeds/reference/basePolicies1953";

// ── Ireland FY1953 — emigration crisis / agricultural economy ───────────────
// GDP ≈ £IR 340M ($953M; at par with GBP = $2.80); peak emigration era (net
// outflow ~40k/yr); Costello coalition → de Valera; overwhelmingly agrarian;
// no industrial policy yet (Whitaker 1958 still 5 years away).
// IEP at Bretton Woods GBP par (seeded with hardPeg).
export const IE_NATIONAL_BUDGET_1953: NationalBudgetSeedConfig = {
  budgetId: "IE",
  countryId: "IE",
  fiscalYear: 1953,
  population: 2_960_000, // and falling — emigration reducing it year on year
  gdp: 340_000_000, // £IR 340M
  currencyCode: "IEP",
  economicFactors: {
    gdpGrowth: 1.5, // stagnation; emigration absorbing surplus labour
    wageGrowth: 3.0,
    inflationRate: 2.5,
    tradeGrowth: 2.0,
    lastUpdated: new Date(0),
  },
  taxBaseRatios: {
    taxableIncome: 0.35,
    corporateProfits: 0.08,
    wagesAndSalaries: 0.4,
    importValue: 0.3, // highly trade-dependent; large import share
    taxableSales: 0.35,
  },
  otherRevenue: 12_000_000,
  debt: {
    principal: 120_000_000, // ~35% GDP
    interestRate: 0.04,
    ceiling: 150_000_000,
    ceilingLastRaisedYear: 1953,
  },
  creditRating: "A",
  baselineSpendingByCategory: {
    health: 18_000_000,
    education: 16_000_000,
    socialProtection: 25_000_000,
    housing: 12_000_000,
    transport: 8_000_000,
    defense: 6_000_000, // Defence Forces; small; neutral
    other: 15_000_000,
  },
  baselineStateGrants: 8_000_000,
  policyDefaults: COUNTRY_POLICY_CONFIGS_1953.ie.defaults,
  policyOptionOverrides: COUNTRY_POLICY_CONFIGS_1953.ie.optionIndexes,
  taxPolicyIds: {
    incomeTax: "ie_income_tax_rate",
    domesticCorporateTax: "ie_corporate_tax_rate",
    payrollTax: "ie_prsi",
    salesTax: "ie_vat_rate",
  },
};
