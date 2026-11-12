import type { NationalBudgetSeedConfig } from "@/lib/seeds/reference/budgets";
import { COUNTRY_POLICY_CONFIGS } from "@/lib/seeds/reference/basePolicies";

// ── Italy FY1979 — First Republic state budget (lira) ───────────────────────
// ~1979: GDP ≈ ₤360,000B lira; chronic large deficits + pension-heavy welfare;
// big state-holding sector (IRI/ENI). High inflation.
export const IT_NATIONAL_BUDGET_1979: NationalBudgetSeedConfig = {
  budgetId: "IT",
  countryId: "IT",
  fiscalYear: 1979,
  population: 56_400_000,
  gdp: 360_000_000_000_000, // ≈ ₤360,000B lira
  currencyCode: "ITL",
  economicFactors: {
    gdpGrowth: 4.0,
    wageGrowth: 18.0, // scala mobile + high inflation
    inflationRate: 14.8,
    tradeGrowth: 5.0,
    lastUpdated: new Date(0),
  },
  taxBaseRatios: {
    taxableIncome: 0.3,
    corporateProfits: 0.08,
    wagesAndSalaries: 0.42,
    importValue: 0.22,
    taxableSales: 0.5,
  },
  otherRevenue: 14_000_000_000_000,
  debt: {
    principal: 209_000_000_000_000, // ≈ 58% of GDP
    interestRate: 0.135,
    ceiling: 300_000_000_000_000,
    ceilingLastRaisedYear: 1979,
  },
  creditRating: "AA",
  baselineSpendingByCategory: {
    socialSecurity: 40_000_000_000_000, // pension-heavy
    healthcare: 16_000_000_000_000, // new SSN (1978)
    education: 14_000_000_000_000,
    defense: 8_000_000_000_000,
    infrastructure: 18_000_000_000_000, // incl. state-holding investment
    other: 18_000_000_000_000,
  },
  baselineStateGrants: 20_000_000_000_000, // transfers to the regioni
  policyDefaults: COUNTRY_POLICY_CONFIGS.it.defaults,
  policyOptionOverrides: COUNTRY_POLICY_CONFIGS.it.optionIndexes,
  taxPolicyIds: {
    incomeTax: "it_income_tax",
    domesticCorporateTax: "it_corporate_tax",
    payrollTax: "it_social_charges",
    tariffs: "it_customs_tariff",
    salesTax: "it_vat",
  },
};
