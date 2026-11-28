import type { Db } from "mongodb";
import { corporationsCollection } from "@/lib/db/repositories/corporations";
import { corporationHistoryCollection } from "@/lib/db/repositories/corporationHistory";
import { bankLoansCollection } from "@/lib/db/repositories/bankLoans";
import { settledLoanInterestForHistory } from "@/lib/corporations/rules/settledLoanInterest";
/** Publish from the cash-side receipt fields before the banking phase releases the turn. */
export async function publishBankLoanInterestHistory(db: Db, turn: number): Promise<number> {
  const rows = await corporationHistoryCollection(db)
    .find({ turn }, { projection: { corporationId: 1, currencyCode: 1 } })
    .toArray();
  if (!rows.length) return 0;
  const ids = [
    ...new Map(rows.map((row) => [row.corporationId.toString(), row.corporationId])).values(),
  ];
  const [corps, loans] = await Promise.all([
    corporationsCollection(db)
      .find(
        { _id: { $in: ids } },
        {
          projection: {
            [`bankLoanInterestPaidByTurn.${turn}`]: 1,
            [`bankLoanInterestCurrencyByTurn.${turn}`]: 1,
          },
        }
      )
      .toArray(),
    bankLoansCollection(db)
      .find(
        {
          borrowerType: "corporation",
          borrowerId: { $in: ids },
          $or: [{ status: { $in: ["current", "arrears"] } }, { lastProcessedTurn: turn }],
        },
        { projection: { borrowerId: 1, status: 1, originatedTurn: 1, lastProcessedTurn: 1 } }
      )
      .toArray(),
  ]);
  const corpById = new Map(corps.map((corp) => [corp._id.toString(), corp]));
  const loansById = new Map<string, typeof loans>();
  for (const loan of loans) {
    const id = String(loan.borrowerId),
      list = loansById.get(id) ?? [];
    list.push(loan);
    loansById.set(id, list);
  }
  const updates = rows.flatMap((row) => {
    const id = row.corporationId.toString(),
      corp = corpById.get(id);
    if (!corp) return [];
    const paid = settledLoanInterestForHistory({
      turn,
      historyCurrency: row.currencyCode,
      paid: corp.bankLoanInterestPaidByTurn?.[String(turn)],
      paidCurrency: corp.bankLoanInterestCurrencyByTurn?.[String(turn)],
      loans: loansById.get(id) ?? [],
    });
    return paid === null
      ? []
      : [
          {
            updateOne: {
              filter: { _id: row._id, turn, currencyCode: row.currencyCode ?? { $exists: false } },
              update: { $set: { settledBankLoanInterestPaid: paid } },
            },
          },
        ];
  });
  if (updates.length) await corporationHistoryCollection(db).bulkWrite(updates, { ordered: false });
  return updates.length;
}
