import type { NationalBudgetSeedConfig } from "@/lib/seeds/reference/budgets";
import { SEED_TAX_RATES_1953 } from "@/lib/politicalLegislation/seedTaxRates";
import { COUNTRY_POLICY_CONFIGS_1953 } from "@/lib/seeds/reference/basePolicies1953";

// ── West Germany FY1953 — Adenauer / Wirtschaftswunder ──────────────────────
// GDP ≈ DM 138B (~$33B; 4.2 DEM/USD Bretton Woods); London Debt Agreement signed
// Feb 1953; no Bundeswehr yet (1955); Economic Miracle driven by exports + US aid.
// currencyCode EUR = game proxy for DM (display layer shows "Deutsche Mark").
export const DE_NATIONAL_BUDGET_1953: NationalBudgetSeedConfig = {
  budgetId: "DE",
  countryId: "DE",
  fiscalYear: 1953,
  population: 50_000_000, // West Germany only
  gdp: 138_000_000_000, // DM 138B; game unit EUR = 1:1 DM proxy
  currencyCode: "EUR",
  economicFactors: {
    gdpGrowth: 8.5, // Wirtschaftswunder peak
    wageGrowth: 9.0,
    inflationRate: -0.2, // 1953: mild deflation (DM very stable)
    tradeGrowth: 15.0,
    lastUpdated: new Date(0),
  },
  taxBaseRatios: {
    taxableIncome: 0.3,
    corporateProfits: 0.07,
    wagesAndSalaries: 0.4, // Bismarckian social insurance
    importValue: 0.16,
    taxableSales: 0.45,
  },
  otherRevenue: 4_000_000_000,
  debt: {
    principal: 10_000_000_000, // post-London Debt Agreement; very low
    interestRate: 0.035,
    ceiling: 18_000_000_000,
    ceilingLastRaisedYear: 1953,
  },
  creditRating: "AA", // London Debt Agreement (Feb 1953) restored creditworthiness
  // Keys match the DE law book budget categories.
  baselineSpendingByCategory: {
    welfare: 14_000_000_000, // Bismarckian pensions + unemployment insurance
    healthcare: 6_000_000_000, // GKV statutory insurance
    education: 3_000_000_000, // Länder pay most
    defense: 3_000_000_000, // occupation costs; no Bundeswehr until 1955
    transport: 8_000_000_000, // Wirtschaftswunder reconstruction (rail/roads)
    other: 9_000_000_000,
  },
  baselineStateGrants: 5_000_000_000, // transfers to Länder (Länderfinanzausgleich)
  policyDefaults: COUNTRY_POLICY_CONFIGS_1953.de.defaults,
  policyOptionOverrides: COUNTRY_POLICY_CONFIGS_1953.de.optionIndexes,
  seedTaxRatesOverride: SEED_TAX_RATES_1953.DE,
  taxPolicyIds: {
    incomeTax: "de_income_tax_rate",
    domesticCorporateTax: "de_domestic_corporate_tax_rate",
    foreignCorporateTax: "de_foreign_corporate_tax_rate",
    payrollTax: "de_payroll_social_insurance",
    tariffs: "de_customs_tariff_rate",
    salesTax: "de_vat_rate",
    solidaritySurcharge: "de_solidarity_surcharge",
  },
};
