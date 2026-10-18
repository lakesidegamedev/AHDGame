import type { Db } from "mongodb";
import { seedCountryBudgets } from "./seedCountryBudgets";

/**
 * Seeds Turkey's FY1979 national budget, default enacted laws (from the tr_*
 * legislation defaults), per-region state budgets, and the sovereign issuer.
 */
export async function seedTrBudgets(
  db: Db,
  reset: boolean,
  log: (msg: string) => void,
  preset: string
) {
  return seedCountryBudgets(db, reset, log, preset, {
    countryId: "TR",
    fiscalYearFallback: 1979,
    skipWithoutNationalBudget: true,
  });
}
