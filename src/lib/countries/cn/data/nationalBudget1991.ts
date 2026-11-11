import type { NationalBudgetSeedConfig } from "@/lib/seeds/reference/budgets";
import { POPULATION_TOTALS_1991 } from "@/lib/seeds/reference/populationTotals1991";
import { COUNTRY_POLICY_CONFIGS_1991 } from "@/lib/seeds/reference/basePolicies1991";

export const CN_NATIONAL_BUDGET_1991: NationalBudgetSeedConfig = {
  budgetId: "CN",
  countryId: "CN",
  fiscalYear: 1991,
  population: POPULATION_TOTALS_1991.CN.population,
  gdp: 2_178_000_000_000, // ~$378B USD / ~2.18 trillion CNY at 1991 ER
  currencyCode: "CNY",
  economicFactors: {
    gdpGrowth: 9.3, // Deng's "Southern Tour" era expansion (1992 reform peaked 14%)
    wageGrowth: 14.0,
    inflationRate: 3.4,
    tradeGrowth: 18.0,
    lastUpdated: new Date(),
  },
  taxBaseRatios: {
    taxableIncome: 0.05, // small income-tax base pre-1994 reform
    corporateProfits: 0.06,
    wagesAndSalaries: 0.5,
    importValue: 0.18,
    taxableSales: 0.5,
  },
  otherRevenue: 40_000_000_000,
  debt: {
    principal: 120_000_000_000, // domestic debt only; foreign debt small
    interestRate: 0.085,
    ceiling: 180_000_000_000,
    ceilingLastRaisedYear: 1991,
  },
  creditRating: "BBB",
  // CN default spending laws scaled by the CN cost-scale low anchor
  // (0.02; see COST_SCALE_ANCHORS in src/lib/budget/costs.ts). Includes
  // publicSafety (public security + criminal justice).
  baselineSpendingByCategory: {
    education: 67_256_640_000,
    infrastructure: 72_166_560_000,
    socialSecurity: 61_999_320_000,
    other: 50_164_560_000,
    agriculture: 39_395_160_000,
    health: 36_083_280_000,
    defense: 26_726_640_000,
    publicSafety: 22_627_320_000,
  },
  baselineStateGrants: 25_000_000_000,
  policyDefaults: COUNTRY_POLICY_CONFIGS_1991.cn.defaults,
  policyOptionOverrides: COUNTRY_POLICY_CONFIGS_1991.cn.optionIndexes,
  taxPolicyIds: {
    incomeTax: "cn_individual_income_tax",
    domesticCorporateTax: "cn_enterprise_income_tax",
    // foreignCorporateTax intentionally omitted — CN unified EIT in 2008.
    // Engine falls back to domestic rate at seed time (see spec §13.1).
    payrollTax: "cn_social_insurance_contribution",
    tariffs: "cn_customs_tariff",
    salesTax: "cn_value_added_tax",
    landValueAddedTax: "cn_land_value_added_tax",
    urbanMaintenanceTax: "cn_urban_maintenance_construction_tax",
    stampDuty: "cn_stamp_duty",
  },
};
