import type { NationalBudgetSeedConfig } from "@/lib/seeds/reference/budgets";
import { COUNTRY_POLICY_CONFIGS_1953 } from "@/lib/seeds/reference/basePolicies1953";
import { SEED_TAX_RATES_1953 } from "@/lib/politicalLegislation/seedTaxRates";

// ── USSR FY1953 — Stalin era command economy ─────────────────────────────────
// NMP ≈ ₽1.03T post-split (₽1.4T when Ukraine, Byelorussia and the Baltics were
// still RU regions; Bergson/CIA basis); defence secret (~20% NMP); 5th Five-Year Plan;
// Stalin died March 5, 1953; Beria/Khrushchev/Malenkov power struggle ensues.
export const RU_NATIONAL_BUDGET_1953: NationalBudgetSeedConfig = {
  budgetId: "RU",
  countryId: "RU",
  fiscalYear: 1953,
  // The regional seed (ruRegions1953) now models 148.5M across 14 regions:
  // Ukraine, Byelorussia and the Baltics were promoted out of RU into their
  // own countries and took 51.6M with them. The budget keeps the historic
  // ~6% under-count of the regional model (the regional values are authored
  // territorial extents, the budget is calibrated to Western estimates), so
  // it is scaled by the same 188/200.1 ratio the old pair carried:
  // 148.5M x 0.9395 = 139.5M.
  population: 139_500_000,
  // Was ₽1.4T when the regional rollup was ₽1,400,000M. The three departed
  // republics took ₽370,834M of that rollup (UKR 291,667 + BEL 50,000 +
  // BLT 29,167), leaving ₽1,029,166M. National GDP tracks the rollup exactly
  // for 1953, so reconcileStateGdp.ts is a no-op instead of rescaling every
  // RU region by 1.36.
  gdp: 1_029_166_000_000,
  currencyCode: "SUR",
  economicFactors: {
    gdpGrowth: 5.5, // Soviet official; real ~3.5–4%
    wageGrowth: 4.0,
    inflationRate: 0.5, // administered prices; near-zero open inflation
    tradeGrowth: 3.0,
    lastUpdated: new Date(0),
  },
  // Re-authored to the
  // HISTORICAL fiscal budget (≈₽535B outlays / ≈₽540B revenue ≈ 38% of GDP,
  // turnover-tax anchored) — the prior seed spent ₽1,110B ≈ 79% of GDP, which
  // conflated the state's total economic footprint with the fiscal budget and
  // was structurally impossible under the era revenue cap. Command-economy
  // character lives in WHERE the budget goes (~30% to industry/infrastructure)
  // and in high baseline law levels, not in an impossible fiscal share.
  taxBaseRatios: {
    // §4.2a authored ratios: with the 75/25 corporate split these reproduce
    // the effective per-type factors 0.35/0.06/0.02/0.31/0.18/0.55 the RU
    // catalog's receipts table is calibrated on. (The previous ratios —
    // income 0.04 / corp 0.3 / wages 0.45 — would turn the authored slider
    // rates into an unrecognizable ≈₽527B mix.)
    taxableIncome: 0.35,
    corporateProfits: 0.08,
    wagesAndSalaries: 0.31,
    importValue: 0.18,
    taxableSales: 0.55, // turnover-tax the dominant revenue source (31% rate)
  },
  // EVERY absolute rouble line below is the fiscal-scale whole-Union figure
  // multiplied by 0.735 (= ₽1,029,166M / ₽1,400,000M), the share of the
  // regional GDP rollup RU kept when Ukraine, Byelorussia and the Baltics
  // became their own countries. Scaling rather than re-authoring preserves
  // the fiscal-scale rule's shape: outlays ≈38% of GDP, turnover-tax anchored, near
  // balance on day one. The republics' own budgets carry the other 26.5%.
  otherRevenue: 113_000_000_000, // state loans, price-equalization profits, state property
  debt: {
    principal: 15_000_000_000, // minimal external debt; domestic bonds only
    interestRate: 0.02,
    ceiling: 88_000_000_000, // ruling #15: raised for near-balance headroom
    ceilingLastRaisedYear: 1953,
  },
  creditRating: "AA",
  baselineSpendingByCategory: {
    defense: 81_000_000_000, // Soviet Army + Korean commitment (fiscal line)
    education: 40_000_000_000,
    healthcare: 26_000_000_000,
    statePensions: 15_000_000_000, // pre-reform pensions: workers only, meager
    welfare: 18_000_000_000,
    infrastructure: 118_000_000_000, // industry + infrastructure investment (~30%)
    other: 51_000_000_000,
  },
  // Grants pool feeds the republic regional-budget phase and the ±15%
  // calibration goldens; policy configs adopt dev's era-authored 1953 table,
  // though the old su_* catalog is excluded at reset so rates come from the
  // override.
  baselineStateGrants: 44_000_000_000, // transfers to the union republics
  policyDefaults: COUNTRY_POLICY_CONFIGS_1953.su.defaults,
  policyOptionOverrides: COUNTRY_POLICY_CONFIGS_1953.su.optionIndexes,
  seedTaxRatesOverride: SEED_TAX_RATES_1953.RU,
  taxPolicyIds: {
    incomeTax: "su_individual_income_tax",
    domesticCorporateTax: "su_enterprise_levy",
    payrollTax: "su_social_insurance",
    tariffs: "su_customs_tariff",
    salesTax: "su_turnover_tax",
  },
};
