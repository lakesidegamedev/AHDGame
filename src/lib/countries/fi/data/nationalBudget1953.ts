import type { NationalBudgetSeedConfig } from "@/lib/seeds/reference/budgets";
import { COUNTRY_POLICY_CONFIGS_1953 } from "@/lib/seeds/reference/basePolicies1953";

// ── Finland FY1953 — postwar reparations-paid budget (old markka) ───────────
// GDP ≈ mk 790B old markka (230 mk/USD; redenominated 100:1 in 1963). War
// reparations to the USSR delivered in full (1952) — the metal industry they
// built now exports east commercially; Karelian resettlement largely done; a
// brief 1953 recession as the Korean boom deflates.
export const FI_NATIONAL_BUDGET_1953: NationalBudgetSeedConfig = {
  budgetId: "FI",
  countryId: "FI",
  fiscalYear: 1953,
  population: 4_150_000,
  gdp: 790_000_000_000, // ≈ mk 790B old markka
  currencyCode: "FIM",
  economicFactors: {
    gdpGrowth: 1.0, // the 1953 post-Korean-boom recession year
    wageGrowth: 4.0,
    inflationRate: 2.0, // stabilisation after the 1950-51 inflation wave
    tradeGrowth: 3.0,
    lastUpdated: new Date(0),
  },
  // 1953 Finland was still substantially agrarian, so the formal PAYE/payroll
  // base was much narrower than a fully industrialized peer's. Wider ratios
  // produced an implausible day-1 surplus; these keep revenue in line with
  // pre-1960s Nordic tax/GDP ratios.
  taxBaseRatios: {
    taxableIncome: 0.1,
    corporateProfits: 0.06,
    wagesAndSalaries: 0.15,
    importValue: 0.2,
    taxableSales: 0.4,
  },
  otherRevenue: 30_000_000_000, // Alko monopoly, state forests, state-company remittances
  debt: {
    principal: 90_000_000_000, // ~11% of GDP; reparations paid in kind, not borrowed
    interestRate: 0.06,
    ceiling: 200_000_000_000,
    ceilingLastRaisedYear: 1953,
  },
  creditRating: "BBB",
  baselineSpendingByCategory: {
    defense: 10_000_000_000, // Paris-treaty-capped conscript force
    socialSecurity: 28_000_000_000, // war pensions + child allowances (1948)
    education: 18_000_000_000,
    healthcare: 10_000_000_000,
    // Oulujoki hydro (Pyhäkoski/Montta) and the ~400,000-person Karelian
    // resettlement land-settlement program (asutustoiminta) ran concurrently
    // as large state capital programs in 1953; 32B reflects their combined scale.
    infrastructure: 32_000_000_000, // resettlement roads, hydro dams (Oulujoki), rail
    other: 18_000_000_000, // farm supports, Karelian compensation payments
  },
  baselineStateGrants: 14_000_000_000, // municipal grants
  policyDefaults: COUNTRY_POLICY_CONFIGS_1953.fi.defaults,
  policyOptionOverrides: COUNTRY_POLICY_CONFIGS_1953.fi.optionIndexes,
  taxPolicyIds: {
    incomeTax: "fi_income_tax",
    domesticCorporateTax: "fi_corporate_tax",
    payrollTax: "fi_social_charges",
    tariffs: "fi_customs_tariff",
    salesTax: "fi_sales_tax",
  },
};
