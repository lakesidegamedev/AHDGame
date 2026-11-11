import type { NationalBudgetSeedConfig } from "@/lib/seeds/reference/budgets";
import { COUNTRY_POLICY_CONFIGS } from "@/lib/seeds/reference/basePolicies";

// ── China FY1979 — Deng reform era / Four Modernizations / SEZs ─────────────
// GDP ≈ ¥CNY 559B; Deng consolidates power Jan 1979; SEZs authorized July 1979;
// Sino-Vietnamese War Feb 1979; state planning still dominant; rural reform begins.
export const CN_NATIONAL_BUDGET_1979: NationalBudgetSeedConfig = {
  budgetId: "CN",
  countryId: "CN",
  fiscalYear: 1979,
  population: 977_000_000,
  gdp: 559_000_000_000,
  currencyCode: "CNY",
  economicFactors: {
    gdpGrowth: 7.6,
    wageGrowth: 5.0,
    inflationRate: 2.0, // official; shortages differ
    tradeGrowth: 8.0,
    lastUpdated: new Date(0),
  },
  taxBaseRatios: {
    taxableIncome: 0.02, // no individual income tax yet (introduced 1981)
    corporateProfits: 0.35, // state enterprise profit remittances dominant
    wagesAndSalaries: 0.38,
    importValue: 0.08,
    taxableSales: 0.42,
  },
  otherRevenue: 20_000_000_000,
  debt: {
    principal: 8_000_000_000,
    interestRate: 0.04,
    ceiling: 30_000_000_000,
    ceilingLastRaisedYear: 1979,
  },
  creditRating: "B",
  baselineSpendingByCategory: {
    defense: 23_000_000_000, // PLA; Sino-Vietnamese War
    education: 10_000_000_000,
    infrastructure: 70_000_000_000, // plan investment; heavy industry
    agriculture: 11_000_000_000, // rural reform incentives
    socialSecurity: 5_000_000_000,
    other: 20_000_000_000,
  },
  baselineStateGrants: 15_000_000_000,
  policyDefaults: COUNTRY_POLICY_CONFIGS.cn.defaults,
  policyOptionOverrides: COUNTRY_POLICY_CONFIGS.cn.optionIndexes,
  taxPolicyIds: {
    incomeTax: "cn_individual_income_tax",
    domesticCorporateTax: "cn_enterprise_income_tax",
    payrollTax: "cn_social_insurance_contribution",
    tariffs: "cn_customs_tariff",
    salesTax: "cn_value_added_tax",
    landValueAddedTax: "cn_land_value_added_tax",
    urbanMaintenanceTax: "cn_urban_maintenance_construction_tax",
    stampDuty: "cn_stamp_duty",
  },
};
