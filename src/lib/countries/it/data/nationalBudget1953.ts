import type { NationalBudgetSeedConfig } from "@/lib/seeds/reference/budgets";
import { COUNTRY_POLICY_CONFIGS_1953 } from "@/lib/seeds/reference/basePolicies1953";

// ── Italy FY1953 — First Republic / Christian Democrats ─────────────────────
// GDP ≈ $17B USD-equivalent (₤10.6T at 625 ITL/USD).
// 'Miracolo Economico' just starting; modest welfare vs. 1979; Marshall Plan
// investment winding down but legacy strong. Amounts are USD-anchored (like
// US/DE); currencyCode ITL is display-only.
export const IT_NATIONAL_BUDGET_1953: NationalBudgetSeedConfig = {
  budgetId: "IT",
  countryId: "IT",
  fiscalYear: 1953,
  population: 47_500_000,
  gdp: 17_000_000_000, // ≈ $17B (₤10.6T / 625)
  currencyCode: "ITL",
  economicFactors: {
    gdpGrowth: 6.5, // beginning of the Miracolo; rapid industrialisation
    wageGrowth: 5.0,
    inflationRate: 2.5,
    tradeGrowth: 8.0,
    lastUpdated: new Date(0),
  },
  taxBaseRatios: {
    taxableIncome: 0.22,
    corporateProfits: 0.06,
    wagesAndSalaries: 0.35,
    importValue: 0.18,
    taxableSales: 0.4,
  },
  otherRevenue: 560_000_000, // was ₤350B → $560M
  debt: {
    principal: 3_360_000_000, // ~20% GDP; relatively modest
    interestRate: 0.05,
    ceiling: 4_800_000_000,
    ceilingLastRaisedYear: 1953,
  },
  creditRating: "AA",
  baselineSpendingByCategory: {
    socialSecurity: 1_200_000_000, // INPS pensions + INAM health insurance
    healthcare: 320_000_000, // mutualist system; no SSN until 1978
    education: 560_000_000,
    defense: 480_000_000, // NATO member; modest
    infrastructure: 800_000_000, // Marshall Plan legacy reconstruction
    other: 640_000_000,
  },
  baselineStateGrants: 400_000_000,
  policyDefaults: COUNTRY_POLICY_CONFIGS_1953.it.defaults,
  policyOptionOverrides: COUNTRY_POLICY_CONFIGS_1953.it.optionIndexes,
  taxPolicyIds: {
    incomeTax: "it_income_tax",
    domesticCorporateTax: "it_corporate_tax",
    payrollTax: "it_social_charges",
    tariffs: "it_customs_tariff",
    salesTax: "it_vat",
  },
};
