import type { Db } from "mongodb";
import type { CountryId } from "@/lib/constants/countries";
import type { FederalBudget } from "@/lib/db/types/budget";
import { calculateFederalRevenue, loadLatestSourcedImportAggregates } from "@/lib/budget/revenue";
import { normalizeFederalSpending } from "@/lib/budget/spending";
import { loadFxRatesByCurrency } from "@/lib/currency/corporationCapital";

/** The live accounting figures shown on the national Budget page. */
export async function loadBudgetDisplayAccounts(
  db: Db,
  budget: FederalBudget,
  countryId: CountryId,
  currentTurn: number,
  interstateMoneyWiring: boolean
) {
  const sourcedImports = interstateMoneyWiring
    ? (await loadLatestSourcedImportAggregates(db, currentTurn)).get(countryId)
    : undefined;
  const revenue = await calculateFederalRevenue(
    db,
    budget.taxRates,
    budget._id,
    budget,
    undefined,
    undefined,
    sourcedImports ? await loadFxRatesByCurrency(db) : undefined,
    sourcedImports && {
      tariffPaidAnchor: sourcedImports.tariffPaid,
      importValueAnchor: sourcedImports.importValue,
    }
  );
  return { revenue, spending: normalizeFederalSpending(budget.spending) };
}
