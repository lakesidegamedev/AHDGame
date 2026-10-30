/**
 * Sovereign bond risk disclosure. loadSovereignRiskDisclosures reads existing
 * issuer ratings, crisis state and last default in one projected budget query.
 */
import type { Db } from "mongodb";
import type { FederalBudget } from "@/lib/db/types/budget";
import { getNationalBudgetId } from "./sovereign";
import type { CountryId } from "@/lib/constants/countries";

export interface SovereignRiskDisclosure {
  creditRating: string | null;
  crisisState: string | null;
  lastDefaultTurn: number | null;
}

export async function loadSovereignRiskDisclosures(db: Db, countryIds: CountryId[]) {
  const ids = [...new Set(countryIds)];
  if (ids.length === 0) return new Map<string, SovereignRiskDisclosure>();
  const budgets = await db
    .collection<FederalBudget>("federalBudget")
    .find(
      { _id: { $in: ids.map(getNationalBudgetId) } },
      { projection: { creditRating: 1, sovereignCrisisState: 1, lastDefaultTurn: 1 } }
    )
    .toArray();
  const byId = new Map(budgets.map((b) => [b._id, b]));
  const result = new Map<string, SovereignRiskDisclosure>();
  for (const countryId of ids) {
    const budget = byId.get(getNationalBudgetId(countryId));
    if (!budget) continue;
    result.set(countryId, {
      creditRating: budget.creditRating ?? null,
      crisisState: budget.sovereignCrisisState ?? "normal",
      lastDefaultTurn: budget.lastDefaultTurn ?? null,
    });
  }
  return result;
}
