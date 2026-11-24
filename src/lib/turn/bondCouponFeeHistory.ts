/** Record actual corporate coupon credits, charges and fees after the payout pass. */
import type { Db } from "mongodb";
import { corporationHistoryCollection } from "@/lib/db/repositories/corporationHistory";
import { bankMoneyMovesCollection } from "@/lib/db/repositories/bankMoneyMoves";
import type { MoneyMoveRecordLeg } from "@/lib/banking/moneyMove";

export async function recordBondCouponFees(
  db: Db,
  turn: number,
  fees: ReadonlyMap<string, number>,
  legacyIncome: ReadonlyMap<string, number>,
  issuerCosts: ReadonlyMap<string, number>
) {
  const [rows, funded] = await Promise.all([
    corporationHistoryCollection(db)
      .find(
        { turn },
        {
          projection: { _id: 1, corporationId: 1, currencyCode: 1, fxRateAtWrite: 1 },
        }
      )
      .toArray(),
    bankMoneyMovesCollection<{ _id: string; legs: MoneyMoveRecordLeg[] }>(db)
      .find(
        {
          turn,
          kind: { $in: ["sovereign_coupon_funded_payout", "sovereign_coupon_funded_batch_payout"] },
        },
        { projection: { legs: 1 } }
      )
      .toArray(),
  ]);
  const income = new Map(legacyIncome);
  const incomplete = new Set<string>();
  for (const receipt of funded)
    if ((receipt.legs ?? []).some((leg) => !leg.applied))
      for (const leg of receipt.legs ?? []) {
        if (leg.collection === "corporations" && leg.path === "liquidCapital")
          incomplete.add(String(leg.filter?._id));
      }
  for (const receipt of funded)
    for (const leg of receipt.legs ?? []) {
      if (
        !leg.applied ||
        leg.kind !== "credit" ||
        leg.collection !== "corporations" ||
        leg.path !== "liquidCapital"
      )
        continue;
      const id = String(leg.filter?._id);
      const rate = leg.valuation?.localPerAnchor;
      if (!(typeof rate === "number" && Number.isFinite(rate) && rate > 0))
        throw new Error("Corporate coupon receipt has no frozen valuation");
      income.set(id, (income.get(id) ?? 0) + leg.amount / rate);
    }
  const ops = rows.flatMap((row) => {
    const rate = row.currencyCode ? row.fxRateAtWrite : 1;
    if (!(typeof rate === "number" && Number.isFinite(rate) && rate > 0)) return [];
    const id = row.corporationId.toHexString();
    if (incomplete.has(id)) return [];
    return [
      {
        updateOne: {
          filter: { _id: row._id, turn },
          update: {
            $set: {
              bondCouponFxFees: (fees.get(id) ?? 0) * rate,
              settledBondCouponIncome: (income.get(id) ?? 0) * rate,
              settledBondInterestPaid: (issuerCosts.get(id) ?? 0) * rate,
            },
          },
        },
      },
    ];
  });
  if (ops.length) await corporationHistoryCollection(db).bulkWrite(ops, { ordered: false });
}
