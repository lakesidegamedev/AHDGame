import type { NationalBudgetSeedConfig } from "@/lib/seeds/reference/budgets";
import { COUNTRY_POLICY_CONFIGS_1953 } from "@/lib/seeds/reference/basePolicies1953";
import { SEED_TAX_RATES_1953 } from "@/lib/politicalLegislation/seedTaxRates";

// ── United States FY1953 — Eisenhower / 83rd Congress ───────────────────────
export const US_NATIONAL_BUDGET_1953: NationalBudgetSeedConfig = {
  budgetId: "federal",
  countryId: "US",
  fiscalYear: 1953,
  population: 158_000_000,
  gdp: 387_000_000_000,
  currencyCode: "USD",
  economicFactors: {
    gdpGrowth: 4.6, // 1953 real GDP growth
    wageGrowth: 4.5,
    inflationRate: 0.75, // near-zero; 1953 CPI essentially flat
    tradeGrowth: 3.0,
    lastUpdated: new Date(0),
  },
  taxBaseRatios: {
    taxableIncome: 0.35, // high 92% rate but narrower filer base than later eras
    corporateProfits: 0.08, // 52% statutory rate; large corporate profit pool
    wagesAndSalaries: 0.4, // OASDI combined 3.0% (employee+employer) — very low
    importValue: 0.06, // US still largely self-sufficient; smaller trade share
    taxableSales: 0.4,
  },
  otherRevenue: 15_000_000_000, // excise + estate taxes + misc receipts
  debt: {
    principal: 275_000_000_000, // gross federal debt end-FY1953
    interestRate: 0.025, // Fed Accord (1951) → Treasuries ~2.5%
    ceiling: 290_000_000_000, // debt ceiling at the time
    ceilingLastRaisedYear: 1954,
  },
  creditRating: "AAA",
  baselineSpendingByCategory: {
    defense: 52_800_000_000, // Korean War + NATO buildup; ~14% GDP
    socialSecurity: 3_500_000_000, // 1950/52 amendments; still modest
    healthcare: 1_600_000_000, // VA hospitals only; no Medicare/Medicaid
    education: 700_000_000, // almost entirely state-funded; minimal federal
    infrastructure: 1_400_000_000, // pre-Interstate Highway System (Act: 1956)
    other: 16_100_000_000,
  },
  baselineStateGrants: 3_500_000_000,
  policyDefaults: COUNTRY_POLICY_CONFIGS_1953.us.defaults,
  policyOptionOverrides: COUNTRY_POLICY_CONFIGS_1953.us.optionIndexes,
  seedTaxRatesOverride: SEED_TAX_RATES_1953.US,
  taxPolicyIds: {
    incomeTax: "us_federal_income_tax_rate",
    domesticCorporateTax: "us_federal_domestic_corporate_tax_rate",
    foreignCorporateTax: "us_federal_foreign_corporate_tax_rate",
    payrollTax: "us_federal_payroll_tax_rate",
    tariffs: "us_federal_tariff_rate",
    salesTax: "us_federal_sales_tax_rate",
  },
};
