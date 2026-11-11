import type { NationalBudgetSeedConfig } from "@/lib/seeds/reference/budgets";
import { POPULATION_TOTALS_1991 } from "@/lib/seeds/reference/populationTotals1991";
import { COUNTRY_POLICY_CONFIGS_1991 } from "@/lib/seeds/reference/basePolicies1991";

// ── Sweden FY1991 — post-tax-reform, pre-crisis budget (kronor) ─────────────
// Nominals re-anchored at assembly (anchorFiscal1991) to WDI 1991 GDP,
// kr 1,656B at 6.047 SEK/USD = $0.27T; the literals keep only the authored
// shares (no IMF 1991 debt series for Sweden). The 1990/91 "tax reform of the century" traded top
// marginal cuts (~80%→~50%) for a broadened 25% Moms; the folkhem is at its
// apex while the 1991-93 financial crisis begins. Spend ~52%, deficit ~1%.
export const SE_NATIONAL_BUDGET_1991: NationalBudgetSeedConfig = {
  budgetId: "SE",
  countryId: "SE",
  fiscalYear: 1991,
  population: POPULATION_TOTALS_1991.SE.population,
  gdp: 1_160_000_000_000, // ≈ kr 1,160B (game units; see note above)
  currencyCode: "SEK",
  economicFactors: {
    gdpGrowth: -1.1, // 1991: the crisis recession begins
    wageGrowth: 5.5,
    inflationRate: 9.3, // 1990-91 cost spike before the disinflation
    tradeGrowth: 1.0,
    lastUpdated: new Date(0),
  },
  taxBaseRatios: {
    taxableIncome: 0.44, // still a very high direct-tax base post-reform
    corporateProfits: 0.05,
    wagesAndSalaries: 0.44, // arbetsgivaravgift base
    importValue: 0.25,
    taxableSales: 0.3, // broadened Moms base
  },
  otherRevenue: 63_000_000_000, // non-tax (~5.5% of GDP)
  debt: {
    principal: 500_000_000_000, // ≈ 43% of GDP, about to balloon in the crisis
    interestRate: 0.105, // 1991 krona-defense rates
    ceiling: 650_000_000_000,
    ceilingLastRaisedYear: 1991,
  },
  creditRating: "AAA", // lost only in the 1993 crisis downgrades
  baselineSpendingByCategory: {
    socialSecurity: 210_000_000_000, // pensions + universal benefits at the folkhem apex
    healthcare: 95_000_000_000,
    education: 75_000_000_000,
    defense: 30_000_000_000, // ~2.6% of GDP neutral armed forces
    infrastructure: 45_000_000_000,
    other: 55_000_000_000,
  },
  baselineStateGrants: 45_000_000_000, // transfers to municipalities/county councils
  policyDefaults: COUNTRY_POLICY_CONFIGS_1991.se.defaults,
  policyOptionOverrides: COUNTRY_POLICY_CONFIGS_1991.se.optionIndexes,
  taxPolicyIds: {
    incomeTax: "se_income_tax",
    domesticCorporateTax: "se_corporate_tax",
    payrollTax: "se_social_charges",
    tariffs: "se_customs_tariff",
    salesTax: "se_vat",
  },
};
