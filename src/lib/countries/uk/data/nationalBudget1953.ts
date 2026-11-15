import type { NationalBudgetSeedConfig } from "@/lib/seeds/reference/budgets";
import { COUNTRY_POLICY_CONFIGS_1953 } from "@/lib/seeds/reference/basePolicies1953";
import { SEED_TAX_RATES_1953 } from "@/lib/politicalLegislation/seedTaxRates";

// ── United Kingdom FY1953/54 — Churchill / Attlee legacy ────────────────────
// GDP £14.4B; NHS first full year (£570M); Korean War defence peak £1.6B;
// food rationing ended 1954; gross WW2 debt ~£26B; Bank Rate 4% (raised Jul '52).
export const UK_NATIONAL_BUDGET_1953: NationalBudgetSeedConfig = {
  budgetId: "UK",
  countryId: "UK",
  fiscalYear: 1953,
  population: 50_600_000,
  gdp: 14_400_000_000, // £14.4B
  currencyCode: "GBP",
  economicFactors: {
    gdpGrowth: 4.0, // postwar recovery still running strong
    wageGrowth: 5.5,
    inflationRate: 3.0, // postwar inflation subsiding
    tradeGrowth: 5.0,
    lastUpdated: new Date(0),
  },
  taxBaseRatios: {
    taxableIncome: 0.5, // high income taxes (standard rate 47.5%)
    corporateProfits: 0.1,
    wagesAndSalaries: 0.5,
    importValue: 0.2,
    taxableSales: 0.35,
  },
  otherRevenue: 1_200_000_000,
  debt: {
    principal: 26_000_000_000, // massive WW2 debt (~180% GDP)
    interestRate: 0.04, // Bank Rate 4%
    ceiling: 28_000_000_000,
    ceilingLastRaisedYear: 1953,
  },
  creditRating: "AAA",
  baselineSpendingByCategory: {
    health: 570_000_000, // NHS — new (1948) but growing fast
    education: 400_000_000,
    statePensions: 450_000_000,
    welfare: 300_000_000,
    defense: 1_600_000_000, // Korean War + NATO + global empire; 11% GDP
    transport: 150_000_000,
    other: 800_000_000,
  },
  baselineStateGrants: 250_000_000,
  // policyRevenueConfigs removed (spec §5.1b): the uk_nhs_funding
  // healthcareIncome line was orphaned by the political-legislation exclusion
  // sweep; UK revenue = authored rates × bases + revenue.lawRevenue.
  // (Supersedes dev's era-scaled NHS ladder — the OLD uk_nhs_funding type no
  // longer seeds on the 1953 preset, so its revenue config has no referent.)
  // Policy configs point at the era-correct 1953 table (the MODERN
  // config would be a latent inconsistency).
  policyDefaults: COUNTRY_POLICY_CONFIGS_1953.uk.defaults,
  policyOptionOverrides: COUNTRY_POLICY_CONFIGS_1953.uk.optionIndexes,
  seedTaxRatesOverride: SEED_TAX_RATES_1953.UK,
  taxPolicyIds: {
    incomeTax: "uk_income_tax_rate",
    domesticCorporateTax: "uk_domestic_corporation_tax",
    foreignCorporateTax: "uk_foreign_corporation_tax",
    payrollTax: "uk_national_insurance",
    tariffs: "uk_excise_customs",
    salesTax: "uk_vat",
  },
};
