import {
  GOVT_HEALTHCARE_BUDGET_CATEGORIES,
  GOVT_HEALTHCARE_DEMAND_RATE,
  govtSpendForCategory,
} from "@/lib/constants/commodities";
import {
  COUNTRY_CURRENCY_MAP,
  INITIAL_RATES,
  getRuntimeInitialRates,
} from "@/lib/constants/currencies";
import type { CurrencyCode } from "@/lib/constants/currencies";
import type { CountryId } from "@/lib/constants/countries";

/**
 * Per-country rate that converts a budget in local currency to the anchor
 * currency. Same resolution order as the turn's government demand leg: live
 * rate for the country's currency, then the era table, then the 2019 table.
 */
export function budgetFxRateForCountry(
  countryId: string | undefined,
  fxByCurrency: ReadonlyMap<string, number>,
  preset: string
): number {
  const code = (COUNTRY_CURRENCY_MAP[countryId as keyof typeof COUNTRY_CURRENCY_MAP] ??
    "USD") as CurrencyCode;
  const eraRates = getRuntimeInitialRates(preset);
  return (
    fxByCurrency.get(code) ??
    eraRates[countryId as CountryId] ??
    INITIAL_RATES[countryId as CountryId] ??
    1.0
  );
}

/**
 * Latent healthcare demand implied by national budgets, in visits per turn.
 * Budgets are stored in local currency, so each line is converted to anchor
 * before the anchor base price is applied. This is the uncapped figure: the
 * turn also holds government purchases to a multiple of last turn's supply, so
 * the booked demand can be far lower.
 */
export function govtHealthcareLatentUnits(
  budgets: ReadonlyArray<{
    countryId?: string;
    spending?: { byCategory?: Record<string, number> | null } | null;
  }>,
  basePrice: number,
  fxRateForCountry: (countryId: string | undefined) => number,
  turnsPerYear = 48
): number {
  let units = 0;
  for (const budget of budgets) {
    const annualSpendLocal = govtSpendForCategory(
      budget.spending?.byCategory,
      GOVT_HEALTHCARE_BUDGET_CATEGORIES
    );
    if (annualSpendLocal <= 0) continue;
    const annualSpendAnchor = annualSpendLocal / fxRateForCountry(budget.countryId);
    units += (annualSpendAnchor / turnsPerYear / basePrice) * GOVT_HEALTHCARE_DEMAND_RATE;
  }
  return units;
}
