import type { NationalBudgetSeedConfig } from "@/lib/seeds/reference/budgets";
import { SEED_TAX_RATES_1953 } from "@/lib/politicalLegislation/seedTaxRates";

const CA_GDP_2027 = 3_450_000_000_000;

/**
 * Canada's 2027 general-government budget (federal plus provincial), since the
 * tax laws carry combined rates; provinces keep regional budgets for local
 * choices. GDP and population match caRegions2027.ts. Totals follow the IMF WEO
 * general-government ratios (revenue ~41%, spending ~43% of GDP); debt is
 * federal and provincial market debt; defence is the 2% NATO pledge. Category
 * splits, tax bases and the revenue residual are game allocations.
 * Sources: imf.org/en/Publications/WEO, StatCan table 10-10-0147-01, budget.canada.ca
 */
export const CA_NATIONAL_BUDGET_2027: NationalBudgetSeedConfig = {
  budgetId: "CA",
  countryId: "CA",
  fiscalYear: 2027,
  population: 41_789_000,
  gdp: CA_GDP_2027,
  currencyCode: "CAD",
  economicFactors: {
    gdpGrowth: 1.6,
    wageGrowth: 3.2,
    inflationRate: 2.1,
    tradeGrowth: 2.2,
    lastUpdated: new Date(0),
  },
  taxBaseRatios: {
    taxableIncome: 0.42,
    corporateProfits: 0.14,
    wagesAndSalaries: 0.45,
    importValue: 0.32,
    taxableSales: 0.4,
  },
  // Property taxes, resource royalties, excise, investment income and sales
  // of services. Brings modeled opening revenue to about 40% of GDP.
  otherRevenue: Math.round(CA_GDP_2027 * 0.17),
  debt: {
    principal: 2_350_000_000_000,
    interestRate: 0.034,
    ceiling: 2_800_000_000_000,
    ceilingLastRaisedYear: 2027,
  },
  creditRating: "AAA",
  // Keyed by the law book's budget keys. The opening law book is refit to this
  // mix and sized to receipts at seed.
  baselineSpendingByCategory: {
    health: 330_000_000_000,
    education: 250_000_000_000,
    defense: Math.round(CA_GDP_2027 * 0.02),
    statePensions: 170_000_000_000,
    welfare: 195_000_000_000,
    transport: 120_000_000_000,
    other: 239_000_000_000,
  },
  // Consolidated general government nets federal transfers to the provinces
  // out; they sit inside the health, education and welfare lines above.
  baselineStateGrants: 0,
  skipLegacyLegislation: true,
  seedTaxRatesOverride: { ...SEED_TAX_RATES_1953.CA },
  policyDefaults: {},
  policyOptionOverrides: {},
  taxPolicyIds: {
    incomeTax: "ca.tax.incomeTax",
    domesticCorporateTax: "ca.tax.domesticCorporateTax",
    foreignCorporateTax: "ca.tax.foreignCorporateTax",
    payrollTax: "ca.tax.payrollTax",
    tariffs: "ca.tax.tariffs",
    salesTax: "ca.tax.salesTax",
  },
};
