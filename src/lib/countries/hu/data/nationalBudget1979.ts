import type { NationalBudgetSeedConfig } from "@/lib/seeds/reference/budgets";
import { easternBlocPolicyConfig } from "@/lib/seeds/shared/easternBlocLegislation";
import { COUNTRY_POLICY_CONFIGS } from "@/lib/seeds/reference/basePolicies";

// ── Hungary FY1979 — MSZMP state plan budget (forint) ───────────────────────
export const HU_NATIONAL_BUDGET_1979: NationalBudgetSeedConfig = {
  budgetId: "HU",
  countryId: "HU",
  fiscalYear: 1979,
  population: 10_700_000,
  gdp: 800_000_000_000, // ≈ Ft 800B (net material product basis)
  currencyCode: "HUF",
  economicFactors: {
    gdpGrowth: 3.0,
    wageGrowth: 5.0,
    inflationRate: 4.0,
    tradeGrowth: 3.5,
    lastUpdated: new Date(0),
  },
  // Fiscal-budget scale, matching makeEasternBlocBudget: New
  // Economic Mechanism softened extraction vs orthodoxy, but the prior
  // footprint bases (corp 0.64, taxableSales 1.25) still produced ~92% GDP
  // revenue. Same fiscal bases as the shared helper land ~55% against ~58% spend.
  taxBaseRatios: {
    taxableIncome: 0.06,
    corporateProfits: 0.32, // SOE surplus remitted; fiscal claim, not whole NMP
    wagesAndSalaries: 0.4,
    importValue: 0.12,
    taxableSales: 0.75, // turnover-tax base; capped below 1.0
  },
  otherRevenue: Math.round(800_000_000_000 * 0.12), // direct remittances + state property
  debt: {
    principal: 180_000_000_000,
    interestRate: 0.07,
    ceiling: 280_000_000_000,
    ceilingLastRaisedYear: 1979,
  }, // notable Western debt
  creditRating: "A",
  baselineSpendingByCategory: {
    socialSecurity: Math.round(800_000_000_000 * 0.12),
    healthcare: Math.round(800_000_000_000 * 0.05),
    education: Math.round(800_000_000_000 * 0.06),
    defense: Math.round(800_000_000_000 * 0.05),
    infrastructure: Math.round(800_000_000_000 * 0.18),
    other: Math.round(800_000_000_000 * 0.08),
  },
  baselineStateGrants: Math.round(800_000_000_000 * 0.06),
  policyDefaults: COUNTRY_POLICY_CONFIGS.hu.defaults,
  policyOptionOverrides: COUNTRY_POLICY_CONFIGS.hu.optionIndexes,
  taxPolicyIds: easternBlocPolicyConfig("hu").taxPolicyIds,
};
