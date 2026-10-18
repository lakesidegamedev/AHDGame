import type { Db } from "mongodb";
import { seedCountryBudgets } from "./seedCountryBudgets";

/**
 * Seeds Greece's national budget, default enacted laws (from the gr_*
 * legislation defaults), per-region state budgets, and the sovereign issuer.
 */
export async function seedGrBudgets(
  db: Db,
  reset: boolean,
  log: (msg: string) => void,
  preset: string
) {
  return seedCountryBudgets(db, reset, log, preset, {
    countryId: "GR",
    fiscalYearFallback: 1979,
    skipWithoutNationalBudget: true,
  });
}
