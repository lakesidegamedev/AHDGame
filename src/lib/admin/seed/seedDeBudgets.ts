import type { Db } from "mongodb";
import { seedCountryBudgets } from "./seedCountryBudgets";

/**
 * Seeds only DE budget data: national budget, enacted laws, and Länder budgets.
 */
export async function seedDeBudgets(
  db: Db,
  reset: boolean,
  log: (msg: string) => void,
  preset: string
) {
  return seedCountryBudgets(db, reset, log, preset, {
    countryId: "DE",
    fiscalYearFallback: 2020,
    regionalResetIncludesCountry: false,
    corporationLabel: "country-owned public corporation",
  });
}
