import type { NationalBudgetSeedConfig } from "@/lib/seeds/reference/budgets";
import { COUNTRY_POLICY_CONFIGS } from "@/lib/seeds/reference/basePolicies";

// ── West Germany FY1979 — Schmidt / EMS anchor / Sozialstaat peak ───────────
// GDP ≈ DM 1,254B; DM pillar of new EMS (March 1979); Bundesbank credibility
// kept inflation at 4.1% vs. double-digit neighbours; Sozialstaat ~25% GDP.
// currencyCode EUR = game proxy for Deutsche Mark (display layer handles name).
export const DE_NATIONAL_BUDGET_1979: NationalBudgetSeedConfig = {
  budgetId: "DE",
  countryId: "DE",
  fiscalYear: 1979,
  population: 61_400_000,
  gdp: 1_254_000_000_000,
  currencyCode: "EUR",
  economicFactors: {
    gdpGrowth: 4.2,
    wageGrowth: 6.0,
    inflationRate: 4.1,
    tradeGrowth: 7.0,
    lastUpdated: new Date(0),
  },
  taxBaseRatios: {
    taxableIncome: 0.35,
    corporateProfits: 0.08,
    wagesAndSalaries: 0.48, // Bismarckian social charges dominant
    importValue: 0.22,
    taxableSales: 0.5,
  },
  otherRevenue: 30_000_000_000,
  debt: {
    principal: 320_000_000_000, // ~26% GDP — very low by later standards
    interestRate: 0.08,
    ceiling: 400_000_000_000,
    ceilingLastRaisedYear: 1979,
  },
  creditRating: "AAA",
  baselineSpendingByCategory: {
    socialSecurity: 280_000_000_000, // pensions + unemployment + social assistance
    healthcare: 60_000_000_000,
    education: 30_000_000_000, // Bund share; Länder pay most
    defense: 43_000_000_000, // NATO 3% target; Bundeswehr
    infrastructure: 35_000_000_000,
    other: 50_000_000_000,
  },
  baselineStateGrants: 80_000_000_000,
  policyDefaults: COUNTRY_POLICY_CONFIGS.de.defaults,
  policyOptionOverrides: COUNTRY_POLICY_CONFIGS.de.optionIndexes,
  taxPolicyIds: {
    incomeTax: "de_income_tax_rate",
    domesticCorporateTax: "de_domestic_corporate_tax_rate",
    foreignCorporateTax: "de_foreign_corporate_tax_rate",
    payrollTax: "de_payroll_social_insurance",
    tariffs: "de_customs_tariff_rate",
    salesTax: "de_vat_rate",
    solidaritySurcharge: "de_solidarity_surcharge",
  },
};
