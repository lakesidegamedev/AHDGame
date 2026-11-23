import type { Db } from "mongodb";
import type { CountryId } from "@/lib/constants/countries";
import { federalBudgetCollection } from "@/lib/db/repositories/federalBudget";
import { fiscalApprovalModifiers } from "./rules/performance";

export async function loadNationalFiscalApprovalModifiers(db: Db, countryId: CountryId) {
  const budget = await federalBudgetCollection(db).findOne(
    { countryId },
    { projection: { debtToGdpRatio: 1, surplus: 1, gdp: 1 } }
  );
  if (!budget) return [];
  return fiscalApprovalModifiers(
    budget.debtToGdpRatio * 100,
    budget.gdp > 0 ? (budget.surplus / budget.gdp) * 100 : 0
  );
}
