import type { NationalBudgetSeedConfig } from "@/lib/seeds/reference/budgets";
import { POPULATION_TOTALS_1991 } from "@/lib/seeds/reference/populationTotals1991";
import { COUNTRY_POLICY_CONFIGS_1991 } from "@/lib/seeds/reference/basePolicies1991";

// ── Spain FY1991 — González III expansion budget (pesetas) ──────────────────
// Nominals re-anchored at assembly (anchorFiscal1991) to WDI 1991 GDP,
// ESP 59,929B at 103.9 ESP/USD = $0.58T, and IMF gross debt 41.9% of GDP;
// the literals keep only the authored shares. Peak post-Franco welfare buildout (universal healthcare
// 1989, non-contributory pensions 1990) plus the 1992 Expo/Olympics/AVE
// investment wave. Spend ~42%, deficit ~1.2% of GDP; debt ~44%.
export const ES_NATIONAL_BUDGET_1991: NationalBudgetSeedConfig = {
  budgetId: "ES",
  countryId: "ES",
  fiscalYear: 1991,
  population: POPULATION_TOTALS_1991.ES.population,
  gdp: 38_900_000_000_000, // ≈ ₧38,900B pesetas (game units; see note above)
  currencyCode: "ESP",
  economicFactors: {
    gdpGrowth: 2.5,
    wageGrowth: 8.0,
    inflationRate: 5.9,
    tradeGrowth: 4.0,
    lastUpdated: new Date(0),
  },
  taxBaseRatios: {
    taxableIncome: 0.18, // IRPF matured into the main pillar since 1979
    corporateProfits: 0.1,
    wagesAndSalaries: 0.4,
    importValue: 0.18,
    taxableSales: 0.55, // IVA base (introduced 1986)
  },
  otherRevenue: 2_720_000_000_000, // non-tax + INI dividends (~7% of GDP)
  debt: {
    principal: 17_100_000_000_000, // ≈ 44% of GDP
    interestRate: 0.1,
    ceiling: 22_000_000_000_000,
    ceilingLastRaisedYear: 1991,
  },
  creditRating: "AA",
  baselineSpendingByCategory: {
    socialSecurity: 5_600_000_000_000, // Seguridad Social pensions + new non-contributory tier
    healthcare: 2_400_000_000_000, // universal since the 1989 reform
    education: 1_800_000_000_000,
    defense: 700_000_000_000,
    infrastructure: 1_600_000_000_000, // AVE + Expo 92 + Olympics buildout
    other: 1_400_000_000_000,
  },
  baselineStateGrants: 1_100_000_000_000, // transfers to the autonomous communities
  policyDefaults: COUNTRY_POLICY_CONFIGS_1991.es.defaults,
  policyOptionOverrides: COUNTRY_POLICY_CONFIGS_1991.es.optionIndexes,
  taxPolicyIds: {
    incomeTax: "es_income_tax",
    domesticCorporateTax: "es_corporate_tax",
    payrollTax: "es_social_charges",
    tariffs: "es_customs_tariff",
    salesTax: "es_consumption_tax",
  },
};
