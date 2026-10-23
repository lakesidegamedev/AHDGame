import type { Db } from "mongodb";
import { seedCountryBudgets } from "./seedCountryBudgets";

export async function seedBrBudgets(
  db: Db,
  reset: boolean,
  log: (msg: string) => void,
  preset: string
) {
  return seedCountryBudgets(db, reset, log, preset, {
    countryId: "BR",
    fiscalYearFallback: 2023,
  });
}
