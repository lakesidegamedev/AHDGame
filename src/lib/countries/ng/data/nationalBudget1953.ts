import type { NationalBudgetSeedConfig } from "@/lib/seeds/reference/budgets";
import { COUNTRY_POLICY_CONFIGS_1953 } from "@/lib/seeds/reference/basePolicies1953";

// ── Nigeria FY1953 — British colonial administration ────────────────────────
// Colonial Nigeria under the Crown; Eastern/Western/Northern Regions established;
// Richards Constitution (1946) → Macpherson (1951) → Lyttleton (1954 federal);
// groundnuts, cocoa, palm oil exports. GDP ≈ $3.4B USD-equivalent (£1.2B WAP at
// $2.80/£). Currency was the West African pound (pegged
// 1:1 to GBP) — the naira did not exist until 1973. Amounts are USD-anchored
// (like US/DE); currencyCode NGN is display-only.
export const NG_NATIONAL_BUDGET_1953: NationalBudgetSeedConfig = {
  budgetId: "NG",
  countryId: "NG",
  fiscalYear: 1953,
  population: 30_000_000,
  gdp: 3_400_000_000, // ≈ $3.4B (£1.2B WAP × $2.80)
  currencyCode: "NGN",
  economicFactors: {
    gdpGrowth: 3.5, // moderate colonial growth; commodity export dependence
    wageGrowth: 3.0,
    inflationRate: 3.0,
    tradeGrowth: 5.0,
    lastUpdated: new Date(0),
  },
  taxBaseRatios: {
    taxableIncome: 0.02,
    corporateProfits: 0.03,
    wagesAndSalaries: 0.18,
    importValue: 0.22, // colonial: import tariffs the main revenue source
    taxableSales: 0.2,
  },
  otherRevenue: 196_000_000, // export duties on groundnuts/cocoa/palm oil
  debt: {
    principal: 364_000_000,
    interestRate: 0.05,
    ceiling: 728_000_000,
    ceilingLastRaisedYear: 1953,
  },
  creditRating: "BB",
  baselineSpendingByCategory: {
    socialSecurity: 56_000_000,
    healthcare: 84_000_000,
    education: 224_000_000, // colonial priority; English-medium schools
    defense: 112_000_000, // Royal West African Frontier Force
    infrastructure: 280_000_000, // railways + colonial port infrastructure
    other: 196_000_000,
  },
  baselineStateGrants: 140_000_000, // grants to regional governments
  policyDefaults: COUNTRY_POLICY_CONFIGS_1953.ng.defaults,
  policyOptionOverrides: COUNTRY_POLICY_CONFIGS_1953.ng.optionIndexes,
  taxPolicyIds: {
    incomeTax: "ng_personal_income_tax",
    domesticCorporateTax: "ng_companies_income_tax",
    payrollTax: "ng_paye",
    salesTax: "ng_vat_rate",
  },
};
