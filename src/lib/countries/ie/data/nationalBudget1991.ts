import type { NationalBudgetSeedConfig } from "@/lib/seeds/reference/budgets";
import { COUNTRY_POLICY_CONFIGS_1991 } from "@/lib/seeds/reference/basePolicies1991";

export const IE_NATIONAL_BUDGET_1991: NationalBudgetSeedConfig = {
  budgetId: "IE",
  countryId: "IE",
  fiscalYear: 1991,
  population: 3_525_000,
  gdp: 24_000_000_000, // Legacy authored base; the 1991 opening restores sourced native GDP below.
  currencyCode: "IEP",
  economicFactors: {
    gdpGrowth: 2.0, // pre-Celtic-Tiger
    wageGrowth: 4.0,
    inflationRate: 3.2,
    tradeGrowth: 1.5,
    lastUpdated: new Date(),
  },
  taxBaseRatios: {
    taxableIncome: 0.5,
    corporateProfits: 0.1,
    wagesAndSalaries: 0.52,
    importValue: 0.4,
    taxableSales: 0.3,
  },
  otherRevenue: 2_500_000_000,
  debt: {
    principal: 32_000_000_000, // Legacy scenario debt share, not an observed 1991 debt series.
    interestRate: 0.1,
    ceiling: 38_000_000_000,
    ceilingLastRaisedYear: 1991,
  },
  creditRating: "AA",
  // Reconciled to the IE default spending laws scaled by the IE cost-scale
  // low anchor (0.20; see COST_SCALE_ANCHORS in src/lib/budget/costs.ts).
  // ~32% of 1991 GDP in categories; ~41.7% total incl. debt service. Keys
  // align to the legislation category vocabulary.
  baselineSpendingByCategory: {
    health: 3_385_410_000,
    education: 1_518_570_000,
    socialProtection: 2_280_675_000,
    housing: 967_965_000,
    transport: 1_028_595_000,
    defense: 171_315_000,
    other: 1_630_665_000,
  },
  baselineStateGrants: 1_500_000_000,
  policyDefaults: COUNTRY_POLICY_CONFIGS_1991.ie.defaults,
  policyOptionOverrides: COUNTRY_POLICY_CONFIGS_1991.ie.optionIndexes,
  taxPolicyIds: {
    incomeTax: "ie_income_tax_rate",
    domesticCorporateTax: "ie_corporate_tax_rate",
    payrollTax: "ie_prsi",
    salesTax: "ie_vat_rate",
  },
};
