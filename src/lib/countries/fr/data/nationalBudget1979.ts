import type { NationalBudgetSeedConfig } from "@/lib/seeds/reference/budgets";
import { COUNTRY_POLICY_CONFIGS } from "@/lib/seeds/reference/basePolicies";

// ── France FY1979 — Fifth Republic state budget (francs) ────────────────────
// ~1979: GDP ≈ FFr 2,500B; large welfare state funded by TVA + income +
// social charges; modest deficit and low public debt.
export const FR_NATIONAL_BUDGET_1979: NationalBudgetSeedConfig = {
  budgetId: "FR",
  countryId: "FR",
  fiscalYear: 1979,
  population: 53_400_000,
  gdp: 2_500_000_000_000, // ≈ FFr 2.5T
  currencyCode: "FRF",
  economicFactors: {
    gdpGrowth: 3.3,
    wageGrowth: 12.0, // high nominal (late-70s inflation)
    inflationRate: 10.8,
    tradeGrowth: 4.0,
    lastUpdated: new Date(0),
  },
  taxBaseRatios: {
    taxableIncome: 0.32,
    corporateProfits: 0.09,
    wagesAndSalaries: 0.45, // high social charges base
    importValue: 0.2,
    taxableSales: 0.55, // TVA base
  },
  otherRevenue: 80_000_000_000,
  debt: {
    principal: 520_000_000_000, // ≈ 21% of GDP (low in 1979)
    interestRate: 0.105,
    ceiling: 700_000_000_000,
    ceilingLastRaisedYear: 1979,
  },
  creditRating: "AAA",
  baselineSpendingByCategory: {
    socialSecurity: 220_000_000_000, // Sécurité sociale (largest line)
    healthcare: 90_000_000_000,
    education: 90_000_000_000,
    defense: 70_000_000_000, // force de frappe
    infrastructure: 60_000_000_000,
    other: 80_000_000_000,
  },
  baselineStateGrants: 90_000_000_000,
  policyDefaults: COUNTRY_POLICY_CONFIGS.fr.defaults,
  policyOptionOverrides: COUNTRY_POLICY_CONFIGS.fr.optionIndexes,
  taxPolicyIds: {
    incomeTax: "fr_income_tax",
    domesticCorporateTax: "fr_corporate_tax",
    payrollTax: "fr_social_charges",
    tariffs: "fr_customs_tariff",
    salesTax: "fr_vat",
  },
};
