import type { Db, ObjectId } from "mongodb";
import { loadValuationFxRates } from "@/lib/currency/corporationCapital";
import { groupBondDebt } from "./rules/financialComparison";
import { bondsCollection } from "@/lib/db/repositories/bonds";
/** Batch only the bonds of corporations whose private financials the viewer may inspect. */
export async function loadGroupBondDebt(db: Db, ids: readonly ObjectId[]) {
  if (!ids.length) return new Map<string, number | null>();
  const [bonds, rates] = await Promise.all([
    bondsCollection(db)
      .find(
        { corporationId: { $in: [...ids] }, matured: false },
        { projection: { corporationId: 1, totalIssued: 1, currencyCode: 1, countryId: 1 } }
      )
      .toArray(),
    loadValuationFxRates(db),
  ]);
  return groupBondDebt(
    ids.map((id) => id.toString()),
    bonds.map((b) => ({
      corporationId: b.corporationId!.toString(),
      principal: b.totalIssued,
      currencyCode: b.currencyCode,
      countryId: b.countryId,
    })),
    rates
  );
}
