import type { NationalBudgetSeedConfig } from "@/lib/seeds/reference/budgets";
import { COUNTRY_POLICY_CONFIGS_1953 } from "@/lib/seeds/reference/basePolicies1953";

// ── Brazil FY1953 — Vargas era / ISI / Petrobras ────────────────────────────
// GDP ≈ Cr$ 330B ($18B; ~18 cruzeiros/USD); Vargas 2nd term (suicide Aug 1954);
// Petrobras founded Oct 1953; ISI: Volta Redonda steel + BNDES investment.
// currencyCode BRL = game proxy for cruzeiro (display layer handles name).
export const BR_NATIONAL_BUDGET_1953: NationalBudgetSeedConfig = {
  budgetId: "BR",
  countryId: "BR",
  fiscalYear: 1953,
  population: 57_000_000,
  gdp: 330_000_000_000, // ≈ Cr$ 330B cruzeiros; game unit BRL = cruzeiro proxy
  currencyCode: "BRL",
  economicFactors: {
    gdpGrowth: 4.5, // Vargas-era ISI growth
    wageGrowth: 15.0,
    inflationRate: 8.0, // Vargas-era chronic inflation, but authored with headroom
    // below MAX_INFLATION (15). Seeded at 12.0 it drifted to 14.4 by t2 and
    // pinned to the clamp by t3, where it stayed for the rest of the run — a
    // clamped series is held, not settling, so the whole monetary response
    // becomes unreadable. Same treatment the 1991 table already documents for
    // countries whose real inflation exceeds the model ceiling.
    tradeGrowth: 3.0,
    lastUpdated: new Date(0),
  },
  taxBaseRatios: {
    taxableIncome: 0.15,
    corporateProfits: 0.06,
    wagesAndSalaries: 0.3,
    importValue: 0.12,
    taxableSales: 0.35,
  },
  otherRevenue: 20_000_000_000,
  debt: {
    principal: 50_000_000_000, // ~15% GDP
    interestRate: 0.1,
    ceiling: 80_000_000_000,
    ceilingLastRaisedYear: 1953,
  },
  creditRating: "BB",
  // Scaled so day-1 spending stays consistent with this config's own
  // revenue side (~21% of GDP): the prior totals produced a ~35%-of-GDP
  // structural deficit from turn 1, which compounded to runaway debt.
  // Every key below is also pinned by a real spending law
  // (brLegislationTypes.ts) via EXTRA_OVERRIDE_CATEGORIES_BY_COUNTRY.BR /
  // GRANT_OVERRIDE_COUNTRIES, so the baseline is no longer the sole source.
  baselineSpendingByCategory: {
    socialSecurity: 12_500_000_000,
    healthcare: 4_000_000_000,
    education: 10_000_000_000,
    defense: 7_500_000_000,
    infrastructure: 30_000_000_000, // ISI: Volta Redonda, Petrobras, BNDES projects
    other: 17_500_000_000,
  },
  baselineStateGrants: 10_000_000_000,
  policyDefaults: COUNTRY_POLICY_CONFIGS_1953.br.defaults,
  policyOptionOverrides: COUNTRY_POLICY_CONFIGS_1953.br.optionIndexes,
  // Each dial's default policyOptionOverrides index (below) is authored at
  // the same rate the old taxRateOverrides stopgap hard-coded (income 18%,
  // corporate 18%, IAP/payroll 20%, IVC/sales 10%, tariff 18%; foreignCorporateTax
  // mirrors domestic per deriveTaxRates), so revenue.total is unchanged.
  // See brLegislationTypes.test.ts.
  taxPolicyIds: {
    incomeTax: "br_income_tax_rate",
    domesticCorporateTax: "br_corporate_tax",
    payrollTax: "br_iap_contribution",
    tariffs: "br_customs_tariff",
    salesTax: "br_ivc",
  },
};
