import type { NationalBudgetSeedConfig } from "@/lib/seeds/reference/budgets";
import { COUNTRY_POLICY_CONFIGS } from "@/lib/seeds/reference/basePolicies";

// ── Greece FY1979 — Karamanlis pre-accession budget (drachmae) ──────────────
// ~1979: GDP ≈ ₯1,500B; second oil shock arriving, ~19% inflation, chronic
// trade deficit bridged by shipping, tourism and emigrant remittances.
export const GR_NATIONAL_BUDGET_1979: NationalBudgetSeedConfig = {
  budgetId: "GR",
  countryId: "GR",
  fiscalYear: 1979,
  population: 9_500_000,
  gdp: 1_500_000_000_000, // ≈ ₯1,500B drachmae
  currencyCode: "GRD",
  economicFactors: {
    gdpGrowth: 3.3,
    wageGrowth: 18.0, // chasing inflation
    inflationRate: 19.0,
    tradeGrowth: 4.0,
    lastUpdated: new Date(0),
  },
  taxBaseRatios: {
    taxableIncome: 0.14, // endemic evasion; narrow declared base
    corporateProfits: 0.06,
    wagesAndSalaries: 0.26,
    importValue: 0.16,
    taxableSales: 0.38,
  },
  otherRevenue: 90_000_000_000, // state banks, DEI/OTE remittances, EEC pre-accession aid
  debt: {
    principal: 330_000_000_000, // ≈ 22% of GDP (the 1980s debt explosion hasn't happened yet)
    interestRate: 0.15,
    ceiling: 600_000_000_000,
    ceilingLastRaisedYear: 1979,
  },
  creditRating: "BBB",
  baselineSpendingByCategory: {
    defense: 90_000_000_000, // ~6% of GDP — the Aegean standoff with Turkey
    socialSecurity: 105_000_000_000,
    education: 60_000_000_000,
    healthcare: 55_000_000_000,
    infrastructure: 75_000_000_000,
    other: 60_000_000_000,
  },
  baselineStateGrants: 45_000_000_000,
  policyDefaults: COUNTRY_POLICY_CONFIGS.gr.defaults,
  policyOptionOverrides: COUNTRY_POLICY_CONFIGS.gr.optionIndexes,
  taxPolicyIds: {
    incomeTax: "gr_income_tax",
    domesticCorporateTax: "gr_corporate_tax",
    payrollTax: "gr_social_charges",
    tariffs: "gr_customs_tariff",
    salesTax: "gr_sales_tax",
  },
};
