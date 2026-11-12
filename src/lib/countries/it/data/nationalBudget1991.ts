import type { NationalBudgetSeedConfig } from "@/lib/seeds/reference/budgets";
import { COUNTRY_POLICY_CONFIGS_1991 } from "@/lib/seeds/reference/basePolicies1991";

// Italy FY1991, Andreotti VII pre-Tangentopoli budget (lira).
// Literals are authored shares, re-anchored at assembly (anchorFiscal1991) to
// WDI 1991 GDP (ITL 1,549,584B at 1,240.6 ITL/USD = $1.25T) and IMF gross
// debt 105.3% of GDP. The defining feature is the historically accurate
// ~10%-of-GDP deficit: debt ~98% of GDP at ~11.5% BTP yields makes the
// interest bill alone ~11% of GDP. Spend ~52%, revenue ~42%.
export const IT_NATIONAL_BUDGET_1991: NationalBudgetSeedConfig = {
  budgetId: "IT",
  countryId: "IT",
  fiscalYear: 1991,
  population: 56_800_000,
  gdp: 1_030_000_000_000_000, // ≈ ₤1,030,000B lira (game units; see note above)
  currencyCode: "ITL",
  economicFactors: {
    gdpGrowth: 1.5,
    wageGrowth: 7.0, // scala mobile winding down
    inflationRate: 6.3,
    tradeGrowth: 3.0,
    lastUpdated: new Date(0),
  },
  taxBaseRatios: {
    taxableIncome: 0.16,
    corporateProfits: 0.09,
    wagesAndSalaries: 0.42, // high INPS base
    importValue: 0.18,
    taxableSales: 0.32, // IVA base eroded by evasion
  },
  otherRevenue: 65_000_000_000_000, // non-tax + state-holding (IRI/ENI) income
  debt: {
    principal: 1_010_000_000_000_000, // ≈ 98% of GDP — the First Republic's legacy
    interestRate: 0.115, // 1991 BTP yields
    ceiling: 1_300_000_000_000_000,
    ceilingLastRaisedYear: 1991,
  },
  creditRating: "AA",
  baselineSpendingByCategory: {
    socialSecurity: 170_000_000_000_000, // pension-heavy (pre-Amato 1992 reform)
    healthcare: 65_000_000_000_000, // SSN
    education: 50_000_000_000_000,
    defense: 20_000_000_000_000,
    infrastructure: 45_000_000_000_000, // incl. state-holding investment
    other: 45_000_000_000_000,
  },
  baselineStateGrants: 25_000_000_000_000, // transfers to the regioni
  policyDefaults: COUNTRY_POLICY_CONFIGS_1991.it.defaults,
  policyOptionOverrides: COUNTRY_POLICY_CONFIGS_1991.it.optionIndexes,
  taxPolicyIds: {
    incomeTax: "it_income_tax",
    domesticCorporateTax: "it_corporate_tax",
    payrollTax: "it_social_charges",
    tariffs: "it_customs_tariff",
    salesTax: "it_vat",
  },
};
