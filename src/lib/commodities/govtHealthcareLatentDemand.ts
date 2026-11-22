import type { CountryId } from "@/lib/constants/countries";
import {
  COUNTRY_CURRENCY_MAP,
  getRuntimeInitialRates,
  INITIAL_RATES,
  type CurrencyCode,
} from "@/lib/constants/currencies";
import {
  GOVT_HEALTHCARE_BUDGET_CATEGORIES,
  GOVT_HEALTHCARE_DEMAND_RATE,
  govtSpendForCategory,
} from "@/lib/constants/commodities";

export function budgetFxRateForCountry(
  countryId: string | undefined,
  fxByCurrency: ReadonlyMap<CurrencyCode, number>,
  preset: string | undefined
): number {
  const code = COUNTRY_CURRENCY_MAP[countryId as CountryId] ?? "USD";
  return (
    fxByCurrency.get(code) ??
    getRuntimeInitialRates(preset)[countryId as CountryId] ??
    INITIAL_RATES[countryId as CountryId] ??
    1.0
  );
}

export function govtHealthcareLatentUnits(
  budgets: ReadonlyArray<{ countryId: string; spending?: { byCategory?: Record<string, number> } }>,
  basePrice: number,
  fxRateForCountry: (countryId: string) => number,
  turnsPerYear = 48
): number {
  let units = 0;
  for (const budget of budgets) {
    const annualSpendLocal = govtSpendForCategory(
      budget.spending?.byCategory,
      GOVT_HEALTHCARE_BUDGET_CATEGORIES
    );
    if (annualSpendLocal <= 0) continue;
    units +=
      (annualSpendLocal / fxRateForCountry(budget.countryId) / turnsPerYear / basePrice) *
      GOVT_HEALTHCARE_DEMAND_RATE;
  }
  return units;
}
