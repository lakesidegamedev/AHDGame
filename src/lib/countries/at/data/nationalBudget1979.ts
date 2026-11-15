import type { NationalBudgetSeedConfig } from "@/lib/seeds/reference/budgets";
import { COUNTRY_POLICY_CONFIGS } from "@/lib/seeds/reference/basePolicies";

// ── Austria FY1979 — Kreisky Austro-Keynesian budget (schilling) ────────────
// ~1979: GDP ≈ öS 920B; hard-schilling D-Mark peg, ~3.7% inflation, near-full
// employment bought with deliberate deficits and the ÖIAG nationalised sector.
export const AT_NATIONAL_BUDGET_1979: NationalBudgetSeedConfig = {
  budgetId: "AT",
  countryId: "AT",
  fiscalYear: 1979,
  population: 7_550_000,
  gdp: 920_000_000_000, // ≈ öS 920B schilling
  currencyCode: "ATS",
  economicFactors: {
    gdpGrowth: 4.7,
    wageGrowth: 6.0, // Parity Commission wage restraint
    inflationRate: 3.7,
    tradeGrowth: 5.0,
    lastUpdated: new Date(0),
  },
  taxBaseRatios: {
    taxableIncome: 0.34, // broad wage-tax base, little evasion
    corporateProfits: 0.08,
    wagesAndSalaries: 0.44,
    importValue: 0.28, // small open economy
    taxableSales: 0.48,
  },
  otherRevenue: 40_000_000_000, // ÖIAG dividends, state monopolies (tobacco, salt), OeNB profit
  debt: {
    principal: 275_000_000_000, // ≈ 30% of GDP after the Austro-Keynesian deficit years
    interestRate: 0.08,
    ceiling: 500_000_000_000,
    ceilingLastRaisedYear: 1979,
  },
  creditRating: "AA",
  baselineSpendingByCategory: {
    defense: 11_000_000_000, // ~1.2% of GDP — neutral militia army
    socialSecurity: 95_000_000_000, // ASVG pensions + family allowances
    education: 50_000_000_000,
    healthcare: 45_000_000_000,
    infrastructure: 55_000_000_000,
    other: 45_000_000_000, // subsidies to the nationalised industries
  },
  baselineStateGrants: 40_000_000_000, // Finanzausgleich to Länder and Gemeinden
  policyDefaults: COUNTRY_POLICY_CONFIGS.at.defaults,
  policyOptionOverrides: COUNTRY_POLICY_CONFIGS.at.optionIndexes,
  taxPolicyIds: {
    incomeTax: "at_income_tax",
    domesticCorporateTax: "at_corporate_tax",
    payrollTax: "at_social_charges",
    tariffs: "at_customs_tariff",
    salesTax: "at_sales_tax",
  },
};
