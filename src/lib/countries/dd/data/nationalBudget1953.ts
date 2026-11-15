import type { NationalBudgetSeedConfig } from "@/lib/seeds/reference/budgets";
import { COUNTRY_POLICY_CONFIGS_1953 } from "@/lib/seeds/reference/basePolicies1953";
import { SEED_TAX_RATES_1953 } from "@/lib/politicalLegislation/seedTaxRates";

// ── East Germany FY1953 — GDR / SED Stalinist plan economy ─────────────────
// NMP ≈ DDM 50B; June 17, 1953 workers' uprising crushed by Soviet tanks;
// reparations to USSR depressing capital formation; population fleeing West.
export const DD_NATIONAL_BUDGET_1953: NationalBudgetSeedConfig = {
  budgetId: "DD",
  countryId: "DD",
  fiscalYear: 1953,
  population: 18_400_000,
  gdp: 50_000_000_000, // ≈ DDM 50B (NMP basis; very uncertain)
  currencyCode: "DDM",
  economicFactors: {
    gdpGrowth: 3.0, // recovering but disrupted by June uprising + Soviet reparations
    wageGrowth: 2.5,
    inflationRate: 0.5, // administered prices
    tradeGrowth: 2.0,
    lastUpdated: new Date(0),
  },
  // Political-legislation calibration (RU-parity §4.2a discipline): the
  // authored slider rates × these ratios reproduce the DD catalog's receipts
  // (product levy the anchor). Fiscal share held to ~35-40% of NMP — the
  // prior ~90% authored spend conflated the state's total economic footprint
  // with the fiscal budget (same structural fix as RU the fiscal-scale rule).
  taxBaseRatios: {
    taxableIncome: 0.35,
    corporateProfits: 0.08, // VEB remittance base (75/25 domestic/foreign split)
    wagesAndSalaries: 0.31,
    importValue: 0.18,
    taxableSales: 0.55, // product-levy base — the dominant revenue source (28% rate)
  },
  otherRevenue: 4_500_000_000, // direct VEB remittances + state property income
  debt: {
    principal: 3_000_000_000, // Soviet reparations treated as debt
    interestRate: 0.04,
    ceiling: 20_000_000_000, // 40% of NMP; credit repricing still disciplines deficits
    ceilingLastRaisedYear: 1953,
  },
  creditRating: "A",
  baselineSpendingByCategory: {
    defense: 2_500_000_000, // KVP (precursor to the army)
    education: 2_200_000_000,
    healthcare: 1_400_000_000,
    statePensions: 1_500_000_000, // unified social insurance pensions
    welfare: 1_200_000_000,
    infrastructure: 4_000_000_000, // plan investment + reconstruction
    other: 3_000_000_000,
  },
  // Grants stay at the SP7-calibrated scale (M 1.5B completes the 17.3B
  // outlay anchor the DD calibration goldens assert); policy configs adopt
  // dev's era-authored 1953 table, though the old dd_* catalog is excluded
  // at reset so rates come from the override.
  baselineStateGrants: 1_500_000_000,
  policyDefaults: COUNTRY_POLICY_CONFIGS_1953.dd.defaults,
  policyOptionOverrides: COUNTRY_POLICY_CONFIGS_1953.dd.optionIndexes,
  seedTaxRatesOverride: SEED_TAX_RATES_1953.DD,
  taxPolicyIds: {
    incomeTax: "dd_income_tax",
    domesticCorporateTax: "dd_enterprise_levy",
    payrollTax: "dd_social_insurance",
    tariffs: "dd_foreign_trade",
    salesTax: "dd_product_tax",
  },
};
