import type { Db } from "mongodb";
import { seedCountryBudgets } from "./seedCountryBudgets";

/**
 * Seeds Italy's FY1979 national budget, default enacted laws (from the it_*
 * legislation defaults), per-region state budgets, and the sovereign issuer.
 */
export async function seedItBudgets(
  db: Db,
  reset: boolean,
  log: (msg: string) => void,
  preset: string
) {
  return seedCountryBudgets(db, reset, log, preset, {
    countryId: "IT",
    fiscalYearFallback: 1979,
    skipWithoutNationalBudget: true,
  });
}
