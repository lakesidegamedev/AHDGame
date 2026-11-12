import type { NationalBudgetSeedConfig } from "@/lib/seeds/reference/budgets";
import { POPULATION_TOTALS_1991 } from "@/lib/seeds/reference/populationTotals1991";
import { COUNTRY_POLICY_CONFIGS_1991 } from "@/lib/seeds/reference/basePolicies1991";

// ── Turkey FY1991 — Özal-era liberalised-but-statist budget (lira) ──────────
// Nominals re-anchored at assembly (anchorFiscal1991) to WDI 1991 GDP in old
// lira, TRL 630,117B at 4,171.8 TRL/USD = $0.15T; the literals keep only the
// authored shares (no IMF 1991 debt or expenditure series for Turkey). Small state: spend ~25%
// of GDP, deficit ~1.2% here (real PSBR was far worse); Gulf War shock year.
export const TR_NATIONAL_BUDGET_1991: NationalBudgetSeedConfig = {
  budgetId: "TR",
  countryId: "TR",
  fiscalYear: 1991,
  population: POPULATION_TOTALS_1991.TR.population,
  gdp: 6_900_000_000_000, // ≈ ₺6,900B lira (game units; see note above)
  currencyCode: "TRL",
  economicFactors: {
    gdpGrowth: 0.9, // Gulf War shock year
    wageGrowth: 60.0, // chasing chronic ~60% inflation
    inflationRate: 66.0,
    tradeGrowth: 3.0, // post-liberalisation export orientation
    lastUpdated: new Date(0),
  },
  taxBaseRatios: {
    taxableIncome: 0.16, // withholding-dominated collection
    corporateProfits: 0.05,
    wagesAndSalaries: 0.24, // SSK coverage still partial
    importValue: 0.12,
    taxableSales: 0.35, // KDV base (VAT introduced 1985)
  },
  otherRevenue: 386_000_000_000, // KİT/SEE income + central-bank transfers (~5.6% of GDP)
  debt: {
    principal: 2_000_000_000_000, // ≈ 29% of GDP
    interestRate: 0.24, // high nominal rates under chronic inflation
    ceiling: 2_800_000_000_000,
    ceilingLastRaisedYear: 1991,
  },
  creditRating: "BB", // pre-1994-crisis Turkey, better than 1979's B
  baselineSpendingByCategory: {
    defense: 260_000_000_000, // ~3.8% of GDP (NATO flank + internal security)
    socialSecurity: 240_000_000_000,
    education: 230_000_000_000,
    healthcare: 110_000_000_000,
    infrastructure: 240_000_000_000, // KİT investment + GAP southeast project
    other: 120_000_000_000,
  },
  baselineStateGrants: 60_000_000_000,
  policyDefaults: COUNTRY_POLICY_CONFIGS_1991.tr.defaults,
  policyOptionOverrides: COUNTRY_POLICY_CONFIGS_1991.tr.optionIndexes,
  taxPolicyIds: {
    incomeTax: "tr_income_tax",
    domesticCorporateTax: "tr_corporate_tax",
    payrollTax: "tr_social_charges",
    tariffs: "tr_customs_tariff",
    salesTax: "tr_sales_tax",
  },
};
