import type { NationalBudgetSeedConfig } from "@/lib/seeds/reference/budgets";
import { COUNTRY_POLICY_CONFIGS } from "@/lib/seeds/reference/basePolicies";

// ── Finland FY1979 — late-Kekkonen devaluation-recovery budget (markka) ─────
// ~1979: GDP ≈ mk 160B; the 1977–78 devaluations restored forest-industry
// competitiveness, growth rebounding hard, Soviet bilateral trade absorbing
// ~20% of exports; a famously low-debt state.
export const FI_NATIONAL_BUDGET_1979: NationalBudgetSeedConfig = {
  budgetId: "FI",
  countryId: "FI",
  fiscalYear: 1979,
  population: 4_770_000,
  gdp: 160_000_000_000, // ≈ mk 160B markka
  currencyCode: "FIM",
  economicFactors: {
    gdpGrowth: 6.5,
    wageGrowth: 9.0, // incomes-policy settlements chasing devaluation inflation
    inflationRate: 7.5,
    tradeGrowth: 8.0,
    lastUpdated: new Date(0),
  },
  taxBaseRatios: {
    taxableIncome: 0.36, // broad wage-tax base, Nordic compliance
    corporateProfits: 0.07,
    wagesAndSalaries: 0.46,
    importValue: 0.26,
    taxableSales: 0.44,
  },
  otherRevenue: 9_000_000_000, // state companies (Neste, Valmet), alcohol monopoly (Alko)
  debt: {
    principal: 19_000_000_000, // ≈ 12% of GDP — very low state debt
    interestRate: 0.09,
    ceiling: 60_000_000_000,
    ceilingLastRaisedYear: 1979,
  },
  creditRating: "AA",
  baselineSpendingByCategory: {
    defense: 2_400_000_000, // ~1.5% of GDP — conscript neutrality defence
    socialSecurity: 17_000_000_000, // KELA + earnings-related pensions
    education: 10_000_000_000, // peruskoulu rollout completing
    healthcare: 8_000_000_000, // universal health centres
    infrastructure: 9_000_000_000,
    other: 8_000_000_000, // farm income supports, regional policy
  },
  baselineStateGrants: 8_000_000_000, // state grants to municipalities (valtionosuudet)
  policyDefaults: COUNTRY_POLICY_CONFIGS.fi.defaults,
  policyOptionOverrides: COUNTRY_POLICY_CONFIGS.fi.optionIndexes,
  taxPolicyIds: {
    incomeTax: "fi_income_tax",
    domesticCorporateTax: "fi_corporate_tax",
    payrollTax: "fi_social_charges",
    tariffs: "fi_customs_tariff",
    salesTax: "fi_sales_tax",
  },
};
