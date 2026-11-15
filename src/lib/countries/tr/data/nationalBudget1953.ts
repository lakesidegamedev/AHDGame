import type { NationalBudgetSeedConfig } from "@/lib/seeds/reference/budgets";
import { COUNTRY_POLICY_CONFIGS_1953 } from "@/lib/seeds/reference/basePolicies1953";

// ── Turkey FY1953 — Menderes boom / NATO member ──────────────────────────────
// GDP ≈ ₺24B (~$8.6B; 2.8 TRL/USD); joined NATO 1952; Menderes growth miracle
// driven by US Marshall Plan successor aid + agricultural mechanisation.
export const TR_NATIONAL_BUDGET_1953: NationalBudgetSeedConfig = {
  budgetId: "TR",
  countryId: "TR",
  fiscalYear: 1953,
  population: 22_500_000,
  gdp: 24_000_000_000, // ≈ ₺24B lira
  currencyCode: "TRL",
  economicFactors: {
    gdpGrowth: 9.5, // Menderes boom (early 1950s); will collapse later in decade
    wageGrowth: 8.0,
    inflationRate: 4.5,
    tradeGrowth: 10.0,
    lastUpdated: new Date(0),
  },
  taxBaseRatios: {
    taxableIncome: 0.15,
    corporateProfits: 0.06,
    wagesAndSalaries: 0.28,
    importValue: 0.15,
    taxableSales: 0.38,
  },
  otherRevenue: 600_000_000,
  debt: {
    principal: 4_000_000_000, // ~17% GDP; moderate for NATO member
    interestRate: 0.08,
    ceiling: 6_000_000_000,
    ceilingLastRaisedYear: 1953,
  },
  creditRating: "BBB",
  baselineSpendingByCategory: {
    defense: 2_500_000_000, // NATO; large military; Korean War contribution
    socialSecurity: 800_000_000,
    education: 900_000_000,
    healthcare: 500_000_000,
    infrastructure: 2_500_000_000, // Menderes era roads, dams, Atatürk Dam
    other: 700_000_000,
  },
  baselineStateGrants: 400_000_000,
  policyDefaults: COUNTRY_POLICY_CONFIGS_1953.tr.defaults,
  policyOptionOverrides: COUNTRY_POLICY_CONFIGS_1953.tr.optionIndexes,
  taxPolicyIds: {
    incomeTax: "tr_income_tax",
    domesticCorporateTax: "tr_corporate_tax",
    payrollTax: "tr_social_charges",
    tariffs: "tr_customs_tariff",
    salesTax: "tr_sales_tax",
  },
};
