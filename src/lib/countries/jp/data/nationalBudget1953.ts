import type { NationalBudgetSeedConfig } from "@/lib/seeds/reference/budgets";
import { SEED_TAX_RATES_1953 } from "@/lib/politicalLegislation/seedTaxRates";
import { COUNTRY_POLICY_CONFIGS_1953 } from "@/lib/seeds/reference/basePolicies1953";

// ── Japan FY1953 — post-Occupation recovery / Korean War boom ───────────────
// GDP ≈ $25.8B USD-equivalent (¥9.3T at 360 JPY/USD Bretton Woods
// USD-anchor). Occupation ended Apr 1952; Korean War procurement boosted
// industry; Article 9 → Self-Defense Forces tiny (~1% GNP). Amounts below are
// USD-anchored (like US/DE); currencyCode JPY is display-only.
export const JP_NATIONAL_BUDGET_1953: NationalBudgetSeedConfig = {
  budgetId: "JP",
  countryId: "JP",
  fiscalYear: 1953,
  population: 86_600_000,
  gdp: 25_800_000_000, // ≈ $25.8B (¥9.3T / 360)
  currencyCode: "JPY",
  economicFactors: {
    gdpGrowth: 9.0, // Korean War boom + reconstruction
    wageGrowth: 10.0,
    inflationRate: 6.5, // postwar inflation slowly subsiding
    tradeGrowth: 20.0,
    lastUpdated: new Date(0),
  },
  taxBaseRatios: {
    taxableIncome: 0.25,
    corporateProfits: 0.08,
    wagesAndSalaries: 0.38,
    importValue: 0.12,
    taxableSales: 0.35,
  },
  otherRevenue: 556_000_000, // was ¥200B → $556M
  debt: {
    principal: 4_170_000_000, // ~16% GDP; recovery-era
    interestRate: 0.06,
    ceiling: 6_940_000_000,
    ceilingLastRaisedYear: 1953,
  },
  creditRating: "BB", // recently independent; below investment-grade internationally
  baselineSpendingByCategory: {
    social: 556_000_000, // minimal; National Pension not until 1961
    healthcare: 500_000_000, // national health insurance being built
    education: 972_000_000, // big priority; Showa era mass education
    defense: 250_000_000, // SDF very small; Article 9; ~1% GNP
    infrastructure: 1_670_000_000, // massive reconstruction infrastructure
    other: 1_670_000_000,
  },
  baselineStateGrants: 1_110_000_000, // 地方交付税 (Local Allocation Tax) — see GRANT_OVERRIDE_COUNTRIES
  policyDefaults: COUNTRY_POLICY_CONFIGS_1953.jp.defaults,
  policyOptionOverrides: COUNTRY_POLICY_CONFIGS_1953.jp.optionIndexes,
  seedTaxRatesOverride: SEED_TAX_RATES_1953.JP,
  taxPolicyIds: {},
};
