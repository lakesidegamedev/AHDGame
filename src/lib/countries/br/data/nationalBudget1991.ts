import type { NationalBudgetSeedConfig } from "@/lib/seeds/reference/budgets";
import { COUNTRY_POLICY_CONFIGS_1991 } from "@/lib/seeds/reference/basePolicies1991";

export const BR_NATIONAL_BUDGET_1991: NationalBudgetSeedConfig = {
  budgetId: "BR",
  countryId: "BR",
  fiscalYear: 1991,
  population: 149_000_000,
  // Brazil's 1991 nominal GDP figure is meaningless because of hyperinflation
  // (peaked >1,000% in 1990). We use the IMF's PPP-adjusted 1991 GDP
  // (~$900B equivalent) translated to a stable game-unit value in BRL using
  // the post-Real-Plan 1994 ratio.
  gdp: 900_000_000_000,
  currencyCode: "BRL",
  economicFactors: {
    gdpGrowth: 1.0, // post-Collor stabilization attempt
    wageGrowth: 50.0, // indexed against hyperinflation
    inflationRate: 480.0, // 1991 IPCA, historical provenance; seeded via openingInflation1991
    tradeGrowth: 0.5,
    lastUpdated: new Date(),
  },
  taxBaseRatios: {
    taxableIncome: 0.3,
    corporateProfits: 0.08,
    wagesAndSalaries: 0.32,
    importValue: 0.1,
    taxableSales: 0.4,
  },
  otherRevenue: 30_000_000_000,
  debt: {
    principal: 500_000_000_000,
    interestRate: 0.2, // hyperinflation surcharge
    ceiling: 700_000_000_000,
    ceilingLastRaisedYear: 1991,
  },
  creditRating: "B", // crisis-era
  // Authored composition, not the opening size: the 1991 preset fills the
  // receipts-plus-small-deficit envelope with this mix (see
  // AUTHORED_MIX_OPENING_1991). Keys match brLegislationTypes categories;
  // the former `health` key matched no law and was silently dropped.
  baselineSpendingByCategory: {
    healthcare: 25_000_000_000,
    education: 30_000_000_000,
    socialSecurity: 90_000_000_000,
    defense: 10_000_000_000,
    infrastructure: 15_000_000_000,
    other: 60_000_000_000,
  },
  baselineStateGrants: 70_000_000_000,
  policyDefaults: COUNTRY_POLICY_CONFIGS_1991.br.defaults,
  policyOptionOverrides: COUNTRY_POLICY_CONFIGS_1991.br.optionIndexes,
  taxPolicyIds: {
    incomeTax: "br_income_tax_rate",
    domesticCorporateTax: "br_corporate_tax",
    payrollTax: "br_inss",
    salesTax: "br_icms",
  },
  // BR taxPolicyIds reference unseeded legislation types → rates seed to 0.
  // Stopgap direct rates for the post-1988-constitution 1991 era (~27% of GDP).
  // Tune when a BR legislation module lands.
  taxRateOverrides: {
    incomeTax: 22,
    domesticCorporateTax: 23,
    foreignCorporateTax: 23,
    payrollTax: 25,
    tariffs: 12,
    salesTax: 15,
  },
};
