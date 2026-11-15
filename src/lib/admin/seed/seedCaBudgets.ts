import type { Db } from "mongodb";
import { seedCountryBudgets } from "./seedCountryBudgets";
import { withCaProvincialServices } from "@/lib/countries/ca/rules/provincialServices";
import { seedCaOpeningFinance } from "./seedCaOpeningFinance";

/**
 * Seeds Canada's national budget, default enacted laws, provincial budgets and
 * sovereign issuer. The 2027 budget row exists only once the roster includes
 * Canada, so this is a no-op until then.
 */
export async function seedCaBudgets(
  db: Db,
  reset: boolean,
  log: (msg: string) => void,
  preset: string
) {
  await seedCountryBudgets(db, reset, log, preset, {
    countryId: "CA",
    fiscalYearFallback: 2027,
    skipWithoutNationalBudget: true,
    prepareRegionalBudget: withCaProvincialServices,
  });
  await seedCaOpeningFinance(db, preset);
}
