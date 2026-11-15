import type { NationalBudgetSeedConfig } from "@/lib/seeds/reference/budgets";
import { COUNTRY_POLICY_CONFIGS } from "@/lib/seeds/reference/basePolicies";

// ── Turkey FY1979 — pre-coup crisis budget (lira) ───────────────────────────
// ~1979: GDP ≈ ₺2,200B lira; large deficit, FX crisis, ~60% inflation, étatist
// KİT sector.
export const TR_NATIONAL_BUDGET_1979: NationalBudgetSeedConfig = {
  budgetId: "TR",
  countryId: "TR",
  fiscalYear: 1979,
  population: 43_500_000,
  gdp: 2_200_000_000_000, // ≈ ₺2,200B lira
  currencyCode: "TRL",
  economicFactors: {
    gdpGrowth: -0.5, // crisis recession
    wageGrowth: 50.0, // chasing runaway inflation
    inflationRate: 63.0,
    tradeGrowth: 2.0,
    lastUpdated: new Date(0),
  },
  taxBaseRatios: {
    taxableIncome: 0.18, // weak collection base
    corporateProfits: 0.07,
    wagesAndSalaries: 0.3,
    importValue: 0.1, // import-substitution: small import base
    taxableSales: 0.4,
  },
  otherRevenue: 120_000_000_000,
  debt: {
    principal: 550_000_000_000, // ≈ 25% of GDP (plus an acute FX/external crisis)
    interestRate: 0.3,
    ceiling: 900_000_000_000,
    ceilingLastRaisedYear: 1979,
  },
  creditRating: "B", // FX crisis, IMF negotiations
  baselineSpendingByCategory: {
    defense: 90_000_000_000, // large military (NATO, internal security)
    socialSecurity: 70_000_000_000,
    education: 55_000_000_000,
    healthcare: 35_000_000_000,
    infrastructure: 110_000_000_000, // KİT investment + subsidies
    other: 80_000_000_000,
  },
  baselineStateGrants: 70_000_000_000,
  policyDefaults: COUNTRY_POLICY_CONFIGS.tr.defaults,
  policyOptionOverrides: COUNTRY_POLICY_CONFIGS.tr.optionIndexes,
  taxPolicyIds: {
    incomeTax: "tr_income_tax",
    domesticCorporateTax: "tr_corporate_tax",
    payrollTax: "tr_social_charges",
    tariffs: "tr_customs_tariff",
    salesTax: "tr_sales_tax",
  },
};
