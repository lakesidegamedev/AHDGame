import type { NationalBudgetSeedConfig } from "@/lib/seeds/reference/budgets";
import { COUNTRY_POLICY_CONFIGS } from "@/lib/seeds/reference/basePolicies";

// ── Nigeria FY1979 — oil boom peak / civilian handover (Shagari) ─────────────
// GDP ≈ ₦23B ($34B; ₦0.67/USD); 2.3M bbl/day oil peak; Obasanjo→Shagari Oct
// 1979 civilian handover; Dutch Disease onset — agriculture severely neglected.
export const NG_NATIONAL_BUDGET_1979: NationalBudgetSeedConfig = {
  budgetId: "NG",
  countryId: "NG",
  fiscalYear: 1979,
  population: 71_000_000,
  gdp: 23_000_000_000,
  currencyCode: "NGN",
  economicFactors: {
    gdpGrowth: 5.5,
    wageGrowth: 14.0,
    inflationRate: 11.8,
    tradeGrowth: 8.0,
    lastUpdated: new Date(0),
  },
  taxBaseRatios: {
    taxableIncome: 0.05,
    corporateProfits: 0.25, // petroleum profit tax + oil company remittances
    wagesAndSalaries: 0.22,
    importValue: 0.3, // petrodollar import boom
    taxableSales: 0.25,
  },
  otherRevenue: 3_000_000_000, // oil royalties
  debt: {
    principal: 2_500_000_000,
    interestRate: 0.1,
    ceiling: 6_000_000_000,
    ceilingLastRaisedYear: 1979,
  },
  creditRating: "BB",
  baselineSpendingByCategory: {
    infrastructure: 3_500_000_000, // oil-boom capital works; ports, roads, FESTAC legacy
    education: 1_500_000_000, // UPE (Universal Primary Education) legacy
    defense: 1_200_000_000,
    healthcare: 500_000_000,
    socialSecurity: 200_000_000,
    other: 1_500_000_000,
  },
  baselineStateGrants: 3_000_000_000, // large oil-derived federal transfers to states
  policyDefaults: COUNTRY_POLICY_CONFIGS.ng.defaults,
  policyOptionOverrides: COUNTRY_POLICY_CONFIGS.ng.optionIndexes,
  taxPolicyIds: {
    incomeTax: "ng_personal_income_tax",
    domesticCorporateTax: "ng_companies_income_tax",
    payrollTax: "ng_paye",
    salesTax: "ng_vat_rate",
  },
};
