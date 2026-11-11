import type { NationalBudgetSeedConfig } from "@/lib/seeds/reference/budgets";
import { COUNTRY_POLICY_CONFIGS } from "@/lib/seeds/reference/basePolicies";

// ── Japan FY1979 — LDP / MITI industrial policy / second oil shock ───────────
// GDP ≈ ¥230T (≈ $1.07T at ¥215/USD); Ohira cabinet; second oil shock hit
// manufacturing; MITI targeted support; SDF ≈ 1% GDP (Article 9 strict).
export const JP_NATIONAL_BUDGET_1979: NationalBudgetSeedConfig = {
  budgetId: "JP",
  countryId: "JP",
  fiscalYear: 1979,
  population: 115_900_000,
  gdp: 230_000_000_000_000,
  currencyCode: "JPY",
  economicFactors: {
    gdpGrowth: 5.3,
    wageGrowth: 4.5,
    inflationRate: 3.6,
    tradeGrowth: 6.0,
    lastUpdated: new Date(0),
  },
  taxBaseRatios: {
    taxableIncome: 0.28,
    corporateProfits: 0.09,
    wagesAndSalaries: 0.4,
    importValue: 0.12,
    taxableSales: 0.38, // no consumption tax yet (introduced 1989)
  },
  otherRevenue: 4_000_000_000_000,
  debt: {
    principal: 70_000_000_000_000, // ~30% GDP; rising via deficit-bond financing
    interestRate: 0.08,
    ceiling: 85_000_000_000_000,
    ceilingLastRaisedYear: 1979,
  },
  creditRating: "AA",
  baselineSpendingByCategory: {
    socialSecurity: 14_000_000_000_000,
    healthcare: 6_000_000_000_000,
    education: 5_000_000_000_000,
    defense: 2_100_000_000_000, // 1% GDP cap strictly observed
    publicWorks: 11_000_000_000_000, // Tanaka-era public works legacy
    other: 8_000_000_000_000,
  },
  baselineStateGrants: 10_000_000_000_000,
  policyDefaults: COUNTRY_POLICY_CONFIGS.jp.defaults,
  policyOptionOverrides: COUNTRY_POLICY_CONFIGS.jp.optionIndexes,
  taxRateOverrides: {
    incomeTax: 25,
    domesticCorporateTax: 23,
    foreignCorporateTax: 19,
    payrollTax: 15,
    tariffs: 0,
    salesTax: 10,
  },
  taxPolicyIds: {},
};
