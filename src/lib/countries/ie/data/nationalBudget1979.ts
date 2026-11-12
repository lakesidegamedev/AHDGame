import type { NationalBudgetSeedConfig } from "@/lib/seeds/reference/budgets";
import { COUNTRY_POLICY_CONFIGS } from "@/lib/seeds/reference/basePolicies";

// ── Ireland FY1979 — EEC transfers / public borrowing surge / EMS entry ─────
// GDP ≈ £IR 9.4B; EMS entry March 1979 breaks 150-yr sterling parity;
// Lynch→Haughey Dec 1979; borrowing ≈ 14% GDP; 10% mfg CT rate attracting MNCs.
export const IE_NATIONAL_BUDGET_1979: NationalBudgetSeedConfig = {
  budgetId: "IE",
  countryId: "IE",
  fiscalYear: 1979,
  population: 3_370_000,
  gdp: 9_400_000_000,
  currencyCode: "IEP",
  economicFactors: {
    gdpGrowth: 3.9,
    wageGrowth: 17.0, // high nominal (13.2% CPI)
    inflationRate: 13.2,
    tradeGrowth: 5.0,
    lastUpdated: new Date(0),
  },
  taxBaseRatios: {
    taxableIncome: 0.38,
    corporateProfits: 0.06, // 10% mfg CT rate; low effective rate
    wagesAndSalaries: 0.42,
    importValue: 0.45, // very open economy (X+M ≈ 110% GDP)
    taxableSales: 0.4,
  },
  otherRevenue: 350_000_000,
  debt: {
    principal: 4_200_000_000, // ~45% GDP; rising sharply
    interestRate: 0.15,
    ceiling: 6_000_000_000,
    ceilingLastRaisedYear: 1979,
  },
  creditRating: "A",
  baselineSpendingByCategory: {
    socialProtection: 1_200_000_000,
    healthcare: 700_000_000,
    education: 500_000_000,
    defense: 70_000_000, // Defence Forces; neutral
    infrastructure: 400_000_000,
    other: 600_000_000,
  },
  baselineStateGrants: 200_000_000,
  policyDefaults: COUNTRY_POLICY_CONFIGS.ie.defaults,
  policyOptionOverrides: COUNTRY_POLICY_CONFIGS.ie.optionIndexes,
  taxPolicyIds: {
    incomeTax: "ie_income_tax_rate",
    domesticCorporateTax: "ie_corporate_tax_rate",
    payrollTax: "ie_prsi",
    salesTax: "ie_vat_rate",
  },
};
