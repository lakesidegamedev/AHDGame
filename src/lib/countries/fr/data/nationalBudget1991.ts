import type { NationalBudgetSeedConfig } from "@/lib/seeds/reference/budgets";
import { POPULATION_TOTALS_1991 } from "@/lib/seeds/reference/populationTotals1991";
import { COUNTRY_POLICY_CONFIGS_1991 } from "@/lib/seeds/reference/basePolicies1991";

// ── France FY1991 — Mitterrand/Rocard budget (francs) ───────────────────────
// Nominals are re-anchored at assembly (anchorFiscal1991) to WDI 1991 GDP,
// FRF 7,102.9B at 5.642 FRF/USD = $1.26T, and IMF gross debt 37.8% of GDP;
// the literals below keep only the authored SHARES. Spend ~50% of GDP (general-government scope), deficit ~1.6% (real
// 1991 deficit ~2%); debt ~36% of GDP, franc-fort disinflation (~3.2%).
export const FR_NATIONAL_BUDGET_1991: NationalBudgetSeedConfig = {
  budgetId: "FR",
  countryId: "FR",
  fiscalYear: 1991,
  population: POPULATION_TOTALS_1991.FR.population,
  gdp: 5_330_000_000_000, // ≈ FFr 5,330B (game units; see note above)
  currencyCode: "FRF",
  economicFactors: {
    gdpGrowth: 1.0, // 1991 slowdown (Gulf War + German-rate squeeze via the EMS)
    wageGrowth: 4.0,
    inflationRate: 3.2, // franc fort success — down from 10.8% in 1979
    tradeGrowth: 3.0,
    lastUpdated: new Date(0),
  },
  taxBaseRatios: {
    taxableIncome: 0.18, // IR + the new CSG broadening the base
    corporateProfits: 0.1,
    wagesAndSalaries: 0.5, // very high cotisations base
    importValue: 0.2,
    taxableSales: 0.52, // TVA base
  },
  otherRevenue: 290_000_000_000, // non-tax + local-tax proxy (~5.4% of GDP)
  debt: {
    principal: 1_920_000_000_000, // ≈ 36% of GDP
    interestRate: 0.09, // 1991 OAT yields ~9%
    ceiling: 2_500_000_000_000,
    ceilingLastRaisedYear: 1991,
  },
  creditRating: "AAA",
  baselineSpendingByCategory: {
    socialSecurity: 1_000_000_000_000, // Sécurité sociale + RMI (largest line)
    healthcare: 480_000_000_000,
    education: 340_000_000_000,
    defense: 170_000_000_000, // ~3.2% of GDP, pre-peace-dividend force
    infrastructure: 130_000_000_000, // TGV Atlantique era
    other: 200_000_000_000,
  },
  baselineStateGrants: 80_000_000_000, // dotations to collectivités locales
  policyDefaults: COUNTRY_POLICY_CONFIGS_1991.fr.defaults,
  policyOptionOverrides: COUNTRY_POLICY_CONFIGS_1991.fr.optionIndexes,
  taxPolicyIds: {
    incomeTax: "fr_income_tax",
    domesticCorporateTax: "fr_corporate_tax",
    payrollTax: "fr_social_charges",
    tariffs: "fr_customs_tariff",
    salesTax: "fr_vat",
  },
};
