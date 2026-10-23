import type { Db } from "mongodb";
import { seedCountryBudgets } from "./seedCountryBudgets";

/**
 * Seeds Sweden's FY1979 national budget, default enacted laws (from the se_*
 * legislation defaults), per-region state budgets, and the sovereign issuer.
 */
export async function seedSeBudgets(
  db: Db,
  reset: boolean,
  log: (msg: string) => void,
  preset: string
) {
  return seedCountryBudgets(db, reset, log, preset, {
    countryId: "SE",
    fiscalYearFallback: 1979,
    skipWithoutNationalBudget: true,
  });
}
