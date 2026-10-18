import type { Db } from "mongodb";
import { seedCountryBudgets } from "./seedCountryBudgets";

/**
 * Seeds Austria's national budget, default enacted laws (from the at_*
 * legislation defaults), per-region state budgets, and the sovereign issuer.
 */
export async function seedAtBudgets(
  db: Db,
  reset: boolean,
  log: (msg: string) => void,
  preset: string
) {
  return seedCountryBudgets(db, reset, log, preset, {
    countryId: "AT",
    fiscalYearFallback: 1979,
    skipWithoutNationalBudget: true,
  });
}
