import type { NationalBudgetSeedConfig } from "@/lib/seeds/reference/budgets";
import { COUNTRY_POLICY_CONFIGS_1953 } from "@/lib/seeds/reference/basePolicies1953";

// ── Spain FY1953 — Francoist autarky / US base treaty ───────────────────────
// GDP ≈ ₧198B pesetas ($5B; ~40 pts/USD); autarky stagnation; INI state sector;
// September 1953: US-Spain base agreements (Pact of Madrid) break isolation.
export const ES_NATIONAL_BUDGET_1953: NationalBudgetSeedConfig = {
  budgetId: "ES",
  countryId: "ES",
  fiscalYear: 1953,
  population: 28_200_000,
  gdp: 198_000_000_000, // ≈ ₧198B pesetas
  currencyCode: "ESP",
  economicFactors: {
    gdpGrowth: 2.0, // autarky constraining growth; below potential
    wageGrowth: 3.0,
    inflationRate: 4.0,
    tradeGrowth: 2.0,
    lastUpdated: new Date(0),
  },
  taxBaseRatios: {
    taxableIncome: 0.2, // weak fiscal capacity; autarky economy
    corporateProfits: 0.06,
    wagesAndSalaries: 0.3,
    importValue: 0.08, // minimal imports under autarky
    taxableSales: 0.4,
  },
  otherRevenue: 8_000_000_000,
  debt: {
    principal: 40_000_000_000, // ~20% GDP; isolated from international markets
    interestRate: 0.06,
    ceiling: 60_000_000_000,
    ceilingLastRaisedYear: 1953,
  },
  creditRating: "BB", // autarky + political isolation; poor credit access
  // Rescaled ~0.55x the original hand-authored total: lines summed to
  // 47% of GDP against this config's own 18.7%-of-GDP revenue, a 28.4%
  // structural deficit that compounded to 904% debt-to-GDP over 650
  // turns. Rescaling brings day-1 deficit to ~8% of GDP while preserving
  // category mix.
  baselineSpendingByCategory: {
    socialSecurity: 9_000_000_000, // Seguro de Vejez + Seguro de Enfermedad
    healthcare: 2_000_000_000,
    education: 4_500_000_000,
    defense: 14_000_000_000, // large army; Ejército del Aire
    infrastructure: 11_000_000_000, // INI autarky industrialisation
    other: 6_500_000_000,
  },
  baselineStateGrants: 3_500_000_000,
  policyDefaults: COUNTRY_POLICY_CONFIGS_1953.es.defaults,
  policyOptionOverrides: COUNTRY_POLICY_CONFIGS_1953.es.optionIndexes,
  taxPolicyIds: {
    incomeTax: "es_income_tax",
    domesticCorporateTax: "es_corporate_tax",
    payrollTax: "es_social_charges",
    tariffs: "es_customs_tariff",
    salesTax: "es_consumption_tax",
  },
};
