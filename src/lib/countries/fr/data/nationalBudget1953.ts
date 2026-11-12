import type { NationalBudgetSeedConfig } from "@/lib/seeds/reference/budgets";
import { COUNTRY_POLICY_CONFIGS_1953 } from "@/lib/seeds/reference/basePolicies1953";

// ── France FY1953 — Fourth Republic / Indochina War ─────────────────────────
// GDP ≈ FFr 16,450B ($47B); Sécurité sociale (1945) maturing; Indochina War
// consuming ~8.5% GDP on defence; inflation stabilising after postwar chaos.
export const FR_NATIONAL_BUDGET_1953: NationalBudgetSeedConfig = {
  budgetId: "FR",
  countryId: "FR",
  fiscalYear: 1953,
  population: 42_800_000,
  gdp: 16_450_000_000_000, // ≈ FFr 16,450B (old francs; 350 FFr/USD Bretton Woods)
  currencyCode: "FRF",
  economicFactors: {
    gdpGrowth: 3.5, // Trente Glorieuses steady growth
    wageGrowth: 5.0,
    inflationRate: 2.5, // stabilising after postwar spike
    tradeGrowth: 6.0,
    lastUpdated: new Date(0),
  },
  taxBaseRatios: {
    taxableIncome: 0.25,
    corporateProfits: 0.07,
    wagesAndSalaries: 0.42, // social charges base building
    importValue: 0.15,
    taxableSales: 0.45,
  },
  otherRevenue: 800_000_000_000,
  debt: {
    principal: 4_200_000_000_000, // WW2 + postwar reconstruction + Indochina
    interestRate: 0.06,
    ceiling: 6_000_000_000_000,
    ceilingLastRaisedYear: 1953,
  },
  creditRating: "A", // Indochina straining finances
  baselineSpendingByCategory: {
    socialSecurity: 1_800_000_000_000, // Sécurité sociale (1945) maturing rapidly
    healthcare: 600_000_000_000,
    education: 700_000_000_000,
    defense: 1_400_000_000_000, // Indochina War at peak; ~8.5% GDP
    infrastructure: 600_000_000_000,
    other: 750_000_000_000,
  },
  baselineStateGrants: 400_000_000_000,
  policyDefaults: COUNTRY_POLICY_CONFIGS_1953.fr.defaults,
  policyOptionOverrides: COUNTRY_POLICY_CONFIGS_1953.fr.optionIndexes,
  taxPolicyIds: {
    incomeTax: "fr_income_tax",
    domesticCorporateTax: "fr_corporate_tax",
    payrollTax: "fr_social_charges",
    tariffs: "fr_customs_tariff",
    salesTax: "fr_vat",
  },
};
