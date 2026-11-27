import type { Db } from "mongodb";
import { federalBudgetCollection } from "@/lib/db/repositories/federalBudget";
import { resolveCountryCurrencyCode } from "@/lib/currency/govBudgetFields";

/** Defence prices and appropriation balances use the current budget denomination. */
export async function loadDefencePaymentCurrency(
  db: Db,
  countryId: string
): Promise<string | null> {
  const budget = await federalBudgetCollection(db).findOne(
    { countryId },
    { projection: { countryId: 1, currencyCode: 1 } }
  );
  return resolveCountryCurrencyCode(budget) ?? null;
}
