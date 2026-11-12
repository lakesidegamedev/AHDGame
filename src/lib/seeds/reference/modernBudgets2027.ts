import type { NationalBudgetSeedConfig } from "./budgets";
import type { State } from "@/lib/db/types";
import { plRegions2027 } from "@/lib/countries/pl/data/plRegions2027";
import { roRegions2027 } from "@/lib/countries/ro/data/roRegions2027";
import { ruRegions2027 } from "@/lib/countries/ru/data/ruRegions2027";
import { easternBlocPolicyConfig } from "@/lib/seeds/shared/easternBlocLegislation";

/**
 * 2027 national fiscal books for Russia, Poland and Romania. Population and
 * GDP are the sums of each country's authored 2027 regions, so the national
 * row and its regions cannot drift apart.
 *
 * Revenue, expenditure and gross debt shares of GDP, growth and inflation are
 * authored estimates in the range of each country's recent general government
 * accounts. They are opening assumptions, not sourced projections or outturns,
 * and should be replaced when a cited 2027 series is authored.
 *
 * Tax bases, effective opening rates, the functional spending split, the debt
 * service rate and the ceiling are game calibrations. The category split sums
 * to expenditure after modeled interest, and other receipts close to revenue.
 */
const FISCAL = {
  RU: {
    regions: ruRegions2027,
    currencyCode: "RUB",
    revenue: 35.0,
    expenditure: 37.3,
    debtRatio: 23.5,
    interest: 0.11,
    growth: 1.1,
    inflation: 4.6,
    rating: "BB",
  },
  PL: {
    regions: plRegions2027,
    currencyCode: "PLN",
    revenue: 43.4,
    expenditure: 49.5,
    debtRatio: 65.3,
    interest: 0.045,
    growth: 3.0,
    inflation: 2.9,
    rating: "A",
  },
  RO: {
    regions: roRegions2027,
    currencyCode: "RON",
    revenue: 34.2,
    expenditure: 40.4,
    debtRatio: 62.0,
    interest: 0.055,
    growth: 1.6,
    inflation: 3.8,
    rating: "BBB",
  },
} as const;

type Modern2027CountryId = keyof typeof FISCAL;

const taxBaseRatios = {
  taxableIncome: 0.4,
  corporateProfits: 0.2,
  wagesAndSalaries: 0.4,
  importValue: 0.15,
  taxableSales: 0.7,
};
const taxRateOverrides = {
  incomeTax: 12,
  domesticCorporateTax: 19,
  foreignCorporateTax: 19,
  payrollTax: 20,
  tariffs: 0,
  salesTax: 20,
};
const coreRevenueShare =
  (taxBaseRatios.taxableIncome * taxRateOverrides.incomeTax +
    taxBaseRatios.corporateProfits * taxRateOverrides.domesticCorporateTax +
    taxBaseRatios.wagesAndSalaries * taxRateOverrides.payrollTax +
    taxBaseRatios.importValue * taxRateOverrides.tariffs +
    taxBaseRatios.taxableSales * taxRateOverrides.salesTax) /
  100;
const spendingShares = {
  healthcare: 0.13,
  education: 0.1,
  defense: 0.1,
  socialSecurity: 0.34,
  infrastructure: 0.12,
  other: 0.13,
  stateGrants: 0.08,
} as const;

const RU_TAX_POLICY_IDS = {
  incomeTax: "ru.tax.incomeTax",
  domesticCorporateTax: "ru.tax.domesticCorporateTax",
  foreignCorporateTax: "ru.tax.foreignCorporateTax",
  payrollTax: "ru.tax.payrollTax",
  tariffs: "ru.tax.tariffs",
  salesTax: "ru.tax.salesTax",
};

function sum(regions: readonly State[], field: "population" | "gdp"): number {
  return regions.reduce((total, region) => total + (region[field] ?? 0), 0);
}

export const MODERN_NATIONAL_BUDGETS_2027: NationalBudgetSeedConfig[] = (
  Object.keys(FISCAL) as Modern2027CountryId[]
).map((countryId) => {
  const fiscal = FISCAL[countryId];
  const population = sum(fiscal.regions, "population");
  // Regional GDP is authored in millions of local currency.
  const gdp = sum(fiscal.regions, "gdp") * 1_000_000;
  const debtPrincipal = Math.round((gdp * fiscal.debtRatio) / 100);
  const operating = Math.round((gdp * fiscal.expenditure) / 100 - debtPrincipal * fiscal.interest);
  const allocations = Object.fromEntries(
    Object.entries(spendingShares).map(([category, share]) => [
      category,
      Math.round(operating * share),
    ])
  );
  return {
    budgetId: countryId,
    countryId,
    fiscalYear: 2027,
    population,
    gdp,
    currencyCode: fiscal.currencyCode,
    economicFactors: {
      gdpGrowth: fiscal.growth,
      wageGrowth: fiscal.growth + fiscal.inflation,
      inflationRate: fiscal.inflation,
      tradeGrowth: fiscal.growth,
      lastUpdated: new Date(0),
    },
    taxBaseRatios,
    otherRevenue: Math.max(0, Math.round(gdp * (fiscal.revenue / 100 - coreRevenueShare))),
    debt: {
      principal: debtPrincipal,
      interestRate: fiscal.interest,
      ceiling: Math.round(debtPrincipal * 1.5),
      ceilingLastRaisedYear: 2027,
    },
    creditRating: fiscal.rating,
    baselineSpendingByCategory: Object.fromEntries(
      Object.entries(allocations).filter(([key]) => key !== "stateGrants")
    ),
    baselineStateGrants: allocations.stateGrants,
    policyDefaults: {},
    policyOptionOverrides: {},
    skipLegacyLegislation: true,
    taxPolicyIds:
      countryId === "RU"
        ? RU_TAX_POLICY_IDS
        : easternBlocPolicyConfig(countryId.toLowerCase()).taxPolicyIds,
    taxRateOverrides,
  };
});
