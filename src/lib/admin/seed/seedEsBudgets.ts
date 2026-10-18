import type { Db } from "mongodb";
import { seedCountryBudgets } from "./seedCountryBudgets";

/**
 * Seeds Spain's FY1979 national budget, default enacted laws (from the es_*
 * legislation defaults), per-region state budgets, and the sovereign issuer.
 */
export async function seedEsBudgets(
  db: Db,
  reset: boolean,
  log: (msg: string) => void,
  preset: string
) {
  return seedCountryBudgets(db, reset, log, preset, {
    countryId: "ES",
    fiscalYearFallback: 1979,
    skipWithoutNationalBudget: true,
  });
}
