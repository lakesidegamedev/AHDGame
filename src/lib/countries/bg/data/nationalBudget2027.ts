import type { NationalBudgetSeedConfig } from "@/lib/seeds/reference/budgets";

// Bulgaria joined the euro on 1 January 2026. This is a 2027 forecast
// calibration, not an enacted 2027 budget. The Commission Spring 2026
// forecast gives 2.2% real growth, 2.6% HICP, -4.3% general-government
// balance and 35.5% debt/GDP. The 2025 Eurostat revenue ratio (38.1% of
// GDP) is held flat as a modeling assumption. The nominal GDP anchor is
// EUR 134.592B from the BACB March 2026 forecast. Spending categories are
// model allocations calibrated to the aggregate forecast, not official
// appropriations.
// https://economy-finance.ec.europa.eu/economic-surveillance-eu-member-states/country-pages-including-country-reports/bulgaria/economic-forecast-bulgaria_en
// https://ec.europa.eu/eurostat/databrowser/view/tec00021/default/table
// https://www.bacb.bg/en/files/archive/2026-03-31/88-interim-reports.pdf/7524
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
