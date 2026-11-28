import type { Db, Document, ClientSession, AnyBulkWriteOperation } from "mongodb";
import { regionalBudgetsCollection } from "@/lib/db/repositories/regionalBudgets";
import { stateBudgetsCollection } from "@/lib/db/repositories/stateBudgets";
import { REGIONAL_DEBT_INTEREST_RATE } from "./rules/regionalDebt";

export interface RegionalCashCredit {
  stateId: string;
  countryId: string;
  amount: number;
}
interface Options {
  session?: ClientSession;
  receipt?: { key: string; turn: number };
}
type CashRow = Document & { _id: string };

/** Route a local-currency receipt to the region's canonical cash owner, never its obsolete mirror. */
export async function creditRegionalCash(
  db: Db,
  credits: RegionalCashCredit[],
  options: Options = {}
): Promise<void> {
  if (credits.some((row) => !Number.isFinite(row.amount) || row.amount < 0))
    throw new Error("Regional cash credit is invalid");
  const rows = credits.filter((row) => row.amount > 0);
  if (!rows.length) return;
  const mongo = options.session ? { session: options.session } : {};
  const canonical = await regionalBudgetsCollection<CashRow>(db)
    .find(
      { _id: { $in: rows.map((row) => row.stateId) } },
      { ...mongo, projection: { _id: 1, countryId: 1 } }
    )
    .toArray();
  const owners = new Set(canonical.map((row) => `${row.countryId}:${row._id}`));
  for (const collection of ["stateBudgets", "regionalBudgets"] as const) {
    const group = rows.filter(
      (row) => owners.has(`${row.countryId}:${row.stateId}`) === (collection === "regionalBudgets")
    );
    if (!group.length) continue;
    const target =
      collection === "regionalBudgets"
        ? regionalBudgetsCollection<CashRow>(db)
        : stateBudgetsCollection<CashRow>(db);
    const operations: AnyBulkWriteOperation<CashRow>[] = group.map((row) => ({
      updateOne: {
        filter: {
          _id: row.stateId,
          countryId: row.countryId,
          ...(options.receipt
            ? {
                $or: [
                  { incomeTaxBatchReceipt: { $exists: false } },
                  { incomeTaxBatchReceipt: null },
                  { "incomeTaxBatchReceipt.turn": { $lt: options.receipt.turn } },
                ],
              }
            : {}),
        },
        update:
          collection === "stateBudgets"
            ? {
                $inc: { balance: row.amount },
                ...(options.receipt ? { $set: { incomeTaxBatchReceipt: options.receipt } } : {}),
              }
            : [
                {
                  $set: {
                    financing: {
                      $mergeObjects: [
                        {
                          principal: 0,
                          annualInterest: 0,
                          interestRate: REGIONAL_DEBT_INTEREST_RATE,
                          lastSettledTurn: 0,
                          borrowed: 0,
                          repaid: 0,
                          interestPaid: 0,
                        },
                        { $ifNull: ["$financing", {}] },
                        { cash: { $add: [{ $ifNull: ["$financing.cash", 0] }, row.amount] } },
                      ],
                    },
                    ...(options.receipt
                      ? { incomeTaxBatchReceipt: { $literal: options.receipt } }
                      : {}),
                  },
                },
              ],
      },
    }));
    const saved = await target.bulkWrite(operations, mongo);
    if (!options.receipt && saved.matchedCount !== group.length)
      throw new Error("Income tax regional treasury unavailable");
    if (options.receipt) {
      const proof = await target
        .find(
          {
            _id: { $in: group.map((row) => row.stateId) },
            "incomeTaxBatchReceipt.key": options.receipt.key,
          },
          { ...mongo, projection: { _id: 1 } }
        )
        .toArray();
      if (proof.length !== group.length)
        throw new Error("Income-tax regional treasury delivery is incomplete");
    }
  }
}
