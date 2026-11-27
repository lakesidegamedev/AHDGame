import type { Db } from "mongodb";
import { creditRegionalCash } from "@/lib/budget/regionalCash";
import { regionalBudgetsCollection } from "@/lib/db/repositories/regionalBudgets";
import { stateBudgetsCollection } from "@/lib/db/repositories/stateBudgets";

/** Call inside the payer's transaction so a receipt cannot outlive its funding. */
export async function creditRegionalExtractionReceipt(
  db: Db,
  stateId: string,
  countryId: string,
  amount: number
): Promise<boolean> {
  const regional = await regionalBudgetsCollection(db).findOne(
    { _id: stateId, countryId: countryId as never },
    { projection: { _id: 1 } }
  );
  const state = regional
    ? null
    : await stateBudgetsCollection(db).findOne(
        { _id: stateId, countryId: countryId as never },
        { projection: { _id: 1 } }
      );
  if (!regional && !state) return false;
  await creditRegionalCash(db, [{ stateId, countryId, amount }]);
  if (!regional) {
    const credited = await stateBudgetsCollection(db).updateOne(
      { _id: stateId, countryId: countryId as never },
      {
        $inc: { "revenue.resourceRoyalties": amount, "revenue.total": amount },
      }
    );
    if (credited.matchedCount !== 1) throw new Error("Extraction royalty region is unavailable");
  }
  return true;
}
