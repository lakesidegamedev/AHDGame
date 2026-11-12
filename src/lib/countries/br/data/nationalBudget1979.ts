import type { NationalBudgetSeedConfig } from "@/lib/seeds/reference/budgets";
import { COUNTRY_POLICY_CONFIGS } from "@/lib/seeds/reference/basePolicies";

// ── Brazil FY1979 — military regime / economic miracle fading ────────────────
// GDP ≈ Cr$ 9.5T cruzeiros (≈ $226B); Figueiredo government; 80% oil imported;
// second oil shock devastating; foreign debt ballooning; indexação; 77% inflation.
// currencyCode BRL = game proxy for cruzeiro (display layer handles name).
export const BR_NATIONAL_BUDGET_1979: NationalBudgetSeedConfig = {
  budgetId: "BR",
  countryId: "BR",
  fiscalYear: 1979,
  population: 121_000_000,
  gdp: 9_500_000_000_000,
  currencyCode: "BRL",
  economicFactors: {
    gdpGrowth: 6.4,
    wageGrowth: 60.0, // high nominal; 77% CPI
    inflationRate: 77.2,
    tradeGrowth: 5.0,
    lastUpdated: new Date(0),
  },
  taxBaseRatios: {
    taxableIncome: 0.18,
    corporateProfits: 0.07,
    wagesAndSalaries: 0.35,
    importValue: 0.1,
    taxableSales: 0.4,
  },
  otherRevenue: 400_000_000_000,
  debt: {
    principal: 1_500_000_000_000, // foreign debt crisis building (will peak 1982)
    interestRate: 0.2,
    ceiling: 2_500_000_000_000,
    ceilingLastRaisedYear: 1979,
  },
  creditRating: "BB",
  baselineSpendingByCategory: {
    socialSecurity: 800_000_000_000,
    healthcare: 300_000_000_000,
    education: 500_000_000_000,
    defense: 350_000_000_000,
    infrastructure: 2_000_000_000_000, // Petrobras, Itaipu Dam, BR-2010 roads
    other: 1_000_000_000_000,
  },
  baselineStateGrants: 600_000_000_000,
  policyDefaults: COUNTRY_POLICY_CONFIGS.br.defaults,
  policyOptionOverrides: COUNTRY_POLICY_CONFIGS.br.optionIndexes,
  taxPolicyIds: {
    incomeTax: "br_income_tax_rate",
    domesticCorporateTax: "br_corporate_tax",
    payrollTax: "br_inss",
    salesTax: "br_icms",
  },
  // BR taxPolicyIds reference unseeded legislation types → rates seed to 0.
  // Stopgap direct rates for the 1979 military-developmentalist era (~25% of
  // GDP). Tune when a BR legislation module lands.
  taxRateOverrides: {
    incomeTax: 20,
    domesticCorporateTax: 22,
    foreignCorporateTax: 22,
    payrollTax: 22,
    tariffs: 15,
    salesTax: 13,
  },
};
