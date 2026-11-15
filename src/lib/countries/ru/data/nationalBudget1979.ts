import type { NationalBudgetSeedConfig } from "@/lib/seeds/reference/budgets";
import { COUNTRY_POLICY_CONFIGS } from "@/lib/seeds/reference/basePolicies";

// ── USSR FY1979 — Soviet state budget (command economy, rubles) ─────────────
// Real ~1979: state budget revenue/expenditure ≈ ₽276B, funded mainly by
// enterprise profit remittances + the turnover tax; minimal external debt.
export const RU_NATIONAL_BUDGET_1979: NationalBudgetSeedConfig = {
  budgetId: "RU",
  countryId: "RU",
  fiscalYear: 1979,
  // Ukraine, Byelorussia and the Baltics left RU for their own countries and
  // took 66.7M of the 260.8M regional rollup with them. The budget figure is
  // scaled by the same share the old pair carried (245/260.8), so the gap
  // between the authored national population and the regional sum is
  // unchanged: 194.1M x 0.9394 = 182.3M.
  population: 182_300_000,
  // ≈ ₽439.5B (Western NMP-based estimate). Was ₽600B against a regional
  // rollup of ₽480,600M; the departed republics took ₽128,600M of that
  // rollup (UKR 95,000 + BEL 17,900 + BLT 15,700), leaving ₽352,000M. The
  // national figure is scaled by the same 352,000/480,600 ratio so the
  // rollup-to-national relationship reconcileStateGdp.ts sees is exactly
  // what it was before the split.
  gdp: 439_500_000_000,
  currencyCode: "SUR",
  economicFactors: {
    gdpGrowth: 2.5, // Brezhnev-era stagnation
    wageGrowth: 3.0,
    inflationRate: 1.0, // suppressed/official (shortages, not open inflation)
    tradeGrowth: 3.0,
    lastUpdated: new Date(0),
  },
  // Nominally balanced Soviet budget: profit remittances +
  // turnover tax extract the plan surplus, so revenue ≈ spend (~57% vs ~60%).
  taxBaseRatios: {
    taxableIncome: 0.05, // tiny flat wage tax
    corporateProfits: 0.32, // large state-enterprise surplus base
    wagesAndSalaries: 0.45,
    importValue: 0.1,
    taxableSales: 0.75, // turnover-tax base (gross turnover)
  },
  // Every absolute rouble line is the whole-Union figure scaled by 0.7325
  // (RU's share of the regional GDP rollup after Ukraine, Byelorussia and
  // the Baltics left), preserving the revenue ≈ spend shape.
  otherRevenue: 51_000_000_000,
  debt: {
    principal: 37_000_000_000, // minimal external debt
    interestRate: 0.02,
    ceiling: 88_000_000_000,
    ceilingLastRaisedYear: 1979,
  },
  creditRating: "AA",
  baselineSpendingByCategory: {
    defense: 44_000_000_000, // large military-industrial complex
    education: 22_000_000_000,
    healthcare: 9_000_000_000,
    socialSecurity: 33_000_000_000,
    infrastructure: 66_000_000_000, // "financing the national economy" (largest line)
    other: 29_000_000_000,
  },
  baselineStateGrants: 59_000_000_000, // transfers to the union republics
  policyDefaults: COUNTRY_POLICY_CONFIGS.su.defaults,
  policyOptionOverrides: COUNTRY_POLICY_CONFIGS.su.optionIndexes,
  taxPolicyIds: {
    incomeTax: "su_individual_income_tax",
    domesticCorporateTax: "su_enterprise_levy",
    payrollTax: "su_social_insurance",
    tariffs: "su_customs_tariff",
    salesTax: "su_turnover_tax",
  },
};
