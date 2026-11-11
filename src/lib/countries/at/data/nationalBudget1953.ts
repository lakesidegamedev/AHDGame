import type { NationalBudgetSeedConfig } from "@/lib/seeds/reference/budgets";
import { COUNTRY_POLICY_CONFIGS_1953 } from "@/lib/seeds/reference/basePolicies1953";

// ── Austria FY1953 — Raab-Kamitz occupied-republic budget (schilling) ────────
// GDP ≈ öS 85B; four-power occupation (occupation costs still on the budget),
// Marshall Plan counterpart funds financing reconstruction, the 1952 Kamitz
// stabilisation just having broken the postwar inflation. No army until 1955.
export const AT_NATIONAL_BUDGET_1953: NationalBudgetSeedConfig = {
  budgetId: "AT",
  countryId: "AT",
  fiscalYear: 1953,
  population: 6_930_000,
  gdp: 85_000_000_000, // ≈ öS 85B schilling
  currencyCode: "ATS",
  economicFactors: {
    gdpGrowth: 3.0, // brief 1953 stabilisation pause before the mid-50s boom
    wageGrowth: 4.0, // wage-price agreements winding down
    inflationRate: 2.0, // Kamitz stabilisation after the 1951 spike
    tradeGrowth: 6.0,
    lastUpdated: new Date(0),
  },
  taxBaseRatios: {
    taxableIncome: 0.24,
    corporateProfits: 0.06,
    wagesAndSalaries: 0.36,
    importValue: 0.2,
    taxableSales: 0.42,
  },
  otherRevenue: 4_000_000_000, // ERP counterpart funds; state monopolies; nationalised-firm remittances
  debt: {
    principal: 12_000_000_000, // ~14% of GDP; prewar debts largely written down
    interestRate: 0.06,
    ceiling: 25_000_000_000,
    ceilingLastRaisedYear: 1953,
  },
  creditRating: "BBB", // occupied but stabilising under American aid
  baselineSpendingByCategory: {
    defense: 800_000_000, // ~1% — no army (until 1955); gendarmerie + occupation costs
    socialSecurity: 9_000_000_000, // war pensions + the coming ASVG
    education: 4_500_000_000,
    healthcare: 3_500_000_000,
    infrastructure: 8_000_000_000, // ERP-funded power (Kaprun), rail, industry rebuild
    other: 5_000_000_000, // food subsidies, occupation costs, USIA losses
  },
  baselineStateGrants: 3_500_000_000, // Finanzausgleich to Länder and Gemeinden
  policyDefaults: COUNTRY_POLICY_CONFIGS_1953.at.defaults,
  policyOptionOverrides: COUNTRY_POLICY_CONFIGS_1953.at.optionIndexes,
  taxPolicyIds: {
    incomeTax: "at_income_tax",
    domesticCorporateTax: "at_corporate_tax",
    payrollTax: "at_social_charges",
    tariffs: "at_customs_tariff",
    salesTax: "at_sales_tax",
  },
};
