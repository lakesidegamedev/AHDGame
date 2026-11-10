/**
 * Opening books and macro arc for the long-run fiscal checkpoints. Shell side
 * of `rules/fiscalCheckpoints.ts`: reads the seeded 2027 national budgets and
 * the authored macro arc, writes nothing.
 */
import type { CountryId } from "@/lib/constants/countries";
import { getEraMonetaryBaseline } from "@/lib/constants/monetaryEra";
import { getInitialNationalBudgetsForPreset } from "@/lib/seeds/reference/budgets";
import type { FiscalOpening, MacroPoint } from "./rules/fiscalCheckpoints";

export const FISCAL_CHECKPOINT_COUNTRIES = ["US", "UK", "DE", "JP", "CN"] as const;
export type FiscalCheckpointCountry = (typeof FISCAL_CHECKPOINT_COUNTRIES)[number];

/** Average years to roll over the debt stock, by country. */
export const AVERAGE_MATURITY_YEARS: Record<FiscalCheckpointCountry, number> = {
  US: 6,
  UK: 14,
  DE: 7,
  JP: 9,
  CN: 6,
};

export function fiscalOpening(country: FiscalCheckpointCountry): FiscalOpening {
  const budget = getInitialNationalBudgetsForPreset("2027-default").find(
    (b) => b.countryId === country
  );
  if (!budget) throw new Error(`No 2027 opening budget for ${country}`);
  return {
    gdp: budget.gdp,
    revenue: budget.revenue.total,
    spending: budget.spending.total,
    debtInterest: budget.spending.debtInterest,
    debt: budget.debt.principal,
    effectiveRate: budget.debt.interestRate,
  };
}

export function macroAtFor(country: FiscalCheckpointCountry): (year: number) => MacroPoint {
  return (year) => {
    const base = getEraMonetaryBaseline(country as CountryId, year);
    if (!base) throw new Error(`No macro arc for ${country} in ${year}`);
    if (base.trendGdpGrowth === undefined)
      throw new Error(`No trend growth for ${country} in ${year}`);
    return {
      trendGrowth: base.trendGdpGrowth,
      inflation: base.targetInflation,
      policyRate: base.neutralPrimeRate,
    };
  };
}
