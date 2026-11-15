import type { NationalBudgetSeedConfig } from "@/lib/seeds/reference/budgets";
import { COUNTRY_POLICY_CONFIGS_1953 } from "@/lib/seeds/reference/basePolicies1953";

// ── Greece FY1953 — Papagos reconstruction budget (drachmae) ────────────────
// GDP ≈ ₯50B (game-abstract pre-revaluation scale); civil-war reconstruction
// on American aid; the Markezinis devaluation (April 1953) resets the drachma
// and opens the investment boom.
export const GR_NATIONAL_BUDGET_1953: NationalBudgetSeedConfig = {
  budgetId: "GR",
  countryId: "GR",
  fiscalYear: 1953,
  population: 7_600_000,
  gdp: 50_000_000_000, // ≈ ₯50B drachmae (game units)
  currencyCode: "GRD",
  economicFactors: {
    gdpGrowth: 7.0, // reconstruction boom after the 1953 devaluation
    wageGrowth: 6.0,
    inflationRate: 9.0, // post-devaluation pass-through, then stabilising
    tradeGrowth: 8.0,
    lastUpdated: new Date(0),
  },
  taxBaseRatios: {
    taxableIncome: 0.1, // very narrow base; agrarian smallholders
    corporateProfits: 0.05,
    wagesAndSalaries: 0.2,
    importValue: 0.18,
    taxableSales: 0.36,
  },
  otherRevenue: 2_500_000_000, // US aid counterpart funds; state monopolies
  debt: {
    principal: 12_000_000_000, // prewar debts in default/settlement; ~24% of GDP
    interestRate: 0.07,
    ceiling: 18_000_000_000,
    ceilingLastRaisedYear: 1953,
  },
  creditRating: "BB", // prewar default legacy, American backing
  baselineSpendingByCategory: {
    defense: 3_200_000_000, // large post-civil-war army; NATO member 1952
    socialSecurity: 1_600_000_000,
    education: 1_200_000_000,
    healthcare: 900_000_000,
    infrastructure: 2_600_000_000, // reconstruction of roads, ports, power (DEI 1950)
    other: 1_200_000_000,
  },
  baselineStateGrants: 800_000_000,
  policyDefaults: COUNTRY_POLICY_CONFIGS_1953.gr.defaults,
  policyOptionOverrides: COUNTRY_POLICY_CONFIGS_1953.gr.optionIndexes,
  taxPolicyIds: {
    incomeTax: "gr_income_tax",
    domesticCorporateTax: "gr_corporate_tax",
    payrollTax: "gr_social_charges",
    tariffs: "gr_customs_tariff",
    salesTax: "gr_sales_tax",
  },
};
