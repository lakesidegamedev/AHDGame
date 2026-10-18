import type { Db } from "mongodb";
import { seedCountryBudgets } from "./seedCountryBudgets";

export async function seedIeBudgets(
  db: Db,
  reset: boolean,
  log: (msg: string) => void,
  preset: string
) {
  return seedCountryBudgets(db, reset, log, preset, {
    countryId: "IE",
    fiscalYearFallback: 2023,
  });
}
