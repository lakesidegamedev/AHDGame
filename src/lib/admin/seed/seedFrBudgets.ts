import type { Db } from "mongodb";
import { seedCountryBudgets } from "./seedCountryBudgets";

/**
 * Seeds France's FY1979 national budget, default enacted laws (from the fr_*
 * legislation defaults), per-region state budgets, and the sovereign issuer.
 */
export async function seedFrBudgets(
  db: Db,
  reset: boolean,
  log: (msg: string) => void,
  preset: string
) {
  return seedCountryBudgets(db, reset, log, preset, {
    countryId: "FR",
    fiscalYearFallback: 1979,
    skipWithoutNationalBudget: true,
  });
}
