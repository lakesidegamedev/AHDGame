import type { NationalBudgetSeedConfig } from "@/lib/seeds/reference/budgets";
import { easternBlocPolicyConfig } from "@/lib/seeds/shared/easternBlocLegislation";

// Explicit HU 2027 fallback. National population is KSH's 1 Jan 2026
// estimate; GDP and general-government revenue/expenditure/debt are the
// latest completed 2025 annual series, not observations of 2027. The
// functional spending split, tax bases/rates, interest and ceiling are
// authored game allocations. The operating split plus modeled debt interest
// reconciles to KSH's HUF 41,141 billion general-government expenditure.
// https://www.ksh.hu/stadat_files/nep/hu/nep0002.html
// https://www.ksh.hu/stadat_files/gdp/en/gdp0094.html
// https://www.ksh.hu/s/en/publications/notification-of-balance-and-debt-of-the-general-government-sector-first-edp-notification-in-2026/index.html
export const HU_NATIONAL_BUDGET_2027: NationalBudgetSeedConfig = {
  budgetId: "HU",
  countryId: "HU",
  fiscalYear: 2027,
  sourceFiscalYear: 2025,
  population: 9_488_000,
  gdp: 87_045_554_000_000,
  currencyCode: "HUF",
  economicFactors: {
    gdpGrowth: 0.5,
    wageGrowth: 6,
    inflationRate: 4.4,
    tradeGrowth: 1,
    lastUpdated: new Date(0),
  },
  taxBaseRatios: {
    taxableIncome: 0.4,
    corporateProfits: 0.2,
    wagesAndSalaries: 0.4,
    importValue: 0.15,
    taxableSales: 0.7,
  },
  // At the authored effective tax bases/rates below, this residual makes
  // the modeled opening revenue HUF 37,082 billion, KSH's 2025 figure.
  otherRevenue: 7_399_466_086_000,
  debt: {
    principal: 64_912_000_000_000,
    interestRate: 0.04,
    ceiling: 81_140_000_000_000,
    ceilingLastRaisedYear: 2027,
  },
  creditRating: "BBB",
  baselineSpendingByCategory: {
    healthcare: 7_000_000_000_000,
    education: 3_000_000_000_000,
    defense: 1_750_000_000_000,
    socialSecurity: 12_000_000_000_000,
    infrastructure: 3_000_000_000_000,
    other: 9_794_520_000_000,
  },
  baselineStateGrants: 2_000_000_000_000,
  // No 1979 one-party ideological policy stance is carried forward.
  policyDefaults: {},
  policyOptionOverrides: {},
  taxPolicyIds: easternBlocPolicyConfig("hu").taxPolicyIds,
  taxRateOverrides: {
    incomeTax: 15,
    domesticCorporateTax: 9,
    foreignCorporateTax: 9,
    payrollTax: 18.5,
    tariffs: 0,
    salesTax: 27,
  },
};
