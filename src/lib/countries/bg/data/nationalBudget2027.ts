import type { NationalBudgetSeedConfig } from "@/lib/seeds/reference/budgets";

// Forecast calibration, not an enacted budget: growth, inflation, balance and
// debt follow the Commission spring forecast, revenue holds the Eurostat ratio
// flat, and spending categories are model allocations to match the aggregates.
// https://economy-finance.ec.europa.eu/economic-surveillance-eu-member-states/country-pages-including-country-reports/bulgaria/economic-forecast-bulgaria_en
// https://ec.europa.eu/eurostat/databrowser/view/tec00021/default/table
export const BG_NATIONAL_BUDGET_2027: NationalBudgetSeedConfig = {
  budgetId: "BG",
  countryId: "BG",
  fiscalYear: 2027,
  population: 6_423_207,
  gdp: 134_592_000_000,
  currencyCode: "EUR",
  economicFactors: {
    gdpGrowth: 2.2,
    wageGrowth: 4.3,
    inflationRate: 2.6,
    tradeGrowth: 2.2,
    lastUpdated: new Date(0),
  },
  taxBaseRatios: {
    taxableIncome: 0.55,
    corporateProfits: 0.08,
    wagesAndSalaries: 0.57,
    importValue: 0.22,
    taxableSales: 0.45,
  },
  otherRevenue: Math.round(134_592_000_000 * 0.0456),
  debt: {
    principal: Math.round(134_592_000_000 * 0.355),
    interestRate: 0.028,
    ceiling: Math.round(134_592_000_000 * 0.4),
    ceilingLastRaisedYear: 2027,
  },
  creditRating: "BBB",
  baselineSpendingByCategory: {
    socialSecurity: Math.round(134_592_000_000 * 0.145),
    healthcare: Math.round(134_592_000_000 * 0.05),
    education: Math.round(134_592_000_000 * 0.045),
    defense: Math.round(134_592_000_000 * 0.03),
    infrastructure: Math.round(134_592_000_000 * 0.03),
    other: Math.round(134_592_000_000 * 0.108),
  },
  baselineStateGrants: Math.round(134_592_000_000 * 0.006),
  policyDefaults: {},
  policyOptionOverrides: {},
  skipLegacyLegislation: true,
  seedTaxRatesOverride: {
    incomeTax: 10,
    domesticCorporateTax: 10,
    foreignCorporateTax: 10,
    payrollTax: 32,
    tariffs: 0,
    salesTax: 20,
  },
  taxPolicyIds: {
    incomeTax: "bg_income_tax",
    domesticCorporateTax: "bg_corporate_tax",
    payrollTax: "bg_social_insurance",
    salesTax: "bg_vat",
  },
};
