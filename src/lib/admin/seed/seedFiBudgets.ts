import type { Db } from "mongodb";
import { seedCountryBudgets } from "./seedCountryBudgets";

/**
 * Seeds Finland's national budget, default enacted laws (from the fi_*
 * legislation defaults), per-region state budgets, and the sovereign issuer.
 */
export async function seedFiBudgets(
  db: Db,
  reset: boolean,
  log: (msg: string) => void,
  preset: string
) {
  return seedCountryBudgets(db, reset, log, preset, {
    countryId: "FI",
    fiscalYearFallback: 1979,
    skipWithoutNationalBudget: true,
  });
}
