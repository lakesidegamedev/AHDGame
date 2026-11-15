import type { NationalBudgetSeedConfig } from "@/lib/seeds/reference/budgets";
import { COUNTRY_POLICY_CONFIGS } from "@/lib/seeds/reference/basePolicies";

// ── Spain FY1979 — Transition state budget (pesetas) ────────────────────────
// ~1979: GDP ≈ ₧15,000B pesetas; modest deficit, very low public debt (Franco
// legacy); large INI state-holding sector; transition-era inflation.
export const ES_NATIONAL_BUDGET_1979: NationalBudgetSeedConfig = {
  budgetId: "ES",
  countryId: "ES",
  fiscalYear: 1979,
  population: 37_000_000,
  gdp: 15_000_000_000_000, // ≈ ₧15,000B pesetas
  currencyCode: "ESP",
  economicFactors: {
    gdpGrowth: 1.0,
    wageGrowth: 16.0, // Moncloa Pacts indexation + inflation
    inflationRate: 15.7,
    tradeGrowth: 4.0,
    lastUpdated: new Date(0),
  },
  taxBaseRatios: {
    taxableIncome: 0.26, // new IRPF, still building base
    corporateProfits: 0.08,
    wagesAndSalaries: 0.4,
    importValue: 0.18,
    taxableSales: 0.45,
  },
  otherRevenue: 600_000_000_000,
  debt: {
    principal: 2_400_000_000_000, // ≈ 16% of GDP (very low)
    interestRate: 0.14,
    ceiling: 4_000_000_000_000,
    ceilingLastRaisedYear: 1979,
  },
  creditRating: "AA",
  baselineSpendingByCategory: {
    socialSecurity: 1_500_000_000_000, // pensions (Seguridad Social)
    healthcare: 700_000_000_000,
    education: 700_000_000_000,
    defense: 400_000_000_000,
    infrastructure: 800_000_000_000, // incl. INI investment
    other: 700_000_000_000,
  },
  baselineStateGrants: 600_000_000_000, // transfers to the new autonomous communities
  policyDefaults: COUNTRY_POLICY_CONFIGS.es.defaults,
  policyOptionOverrides: COUNTRY_POLICY_CONFIGS.es.optionIndexes,
  taxPolicyIds: {
    incomeTax: "es_income_tax",
    domesticCorporateTax: "es_corporate_tax",
    payrollTax: "es_social_charges",
    tariffs: "es_customs_tariff",
    salesTax: "es_consumption_tax",
  },
};
