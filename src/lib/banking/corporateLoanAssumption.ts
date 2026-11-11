import type { Db, ObjectId } from "mongodb";
import type { BankLoan } from "@/lib/db/types/bank";
import {
  ASSUMABLE_LOAN_STATUSES,
  corporateLoanAssumptionRefusal,
} from "./rules/corporateLoanAssumption";
import { bankLoansCollection } from "@/lib/db/repositories/bankLoans";

const plainLoansOf = (borrowerId: ObjectId) => ({
  borrowerType: "corporation" as const,
  borrowerId,
  constructionCollateral: { $exists: false },
});

/**
 * Check, before any money moves, that an absorbing corporation can take on
 * every ordinary bank loan the absorbed one owes. Returns the first reason a
 * player can act on, or null.
 */
export async function corporateLoanAssumptionCheck(
  db: Db,
  input: { fromId: ObjectId; toCurrency: string | undefined }
): Promise<string | null> {
  const loans = await bankLoansCollection(db)
    .find(
      { ...plainLoansOf(input.fromId), status: { $in: ["pending", ...ASSUMABLE_LOAN_STATUSES] } },
      { projection: { status: 1, currency: 1 } }
    )
    .toArray();
  return corporateLoanAssumptionRefusal(loans, input.toCurrency);
}

/**
 * Make the absorbing corporation the borrower on the absorbed one's live
 * ordinary loans. Each write is guarded on the old borrower, so a retry moves
 * only what is still left. Returns the loans this call moved, so a caller
 * that fails before deleting the absorbed corporation can hand them back.
 */
export async function assumeCorporateLoans(
  db: Db,
  input: { fromId: ObjectId; toId: ObjectId }
): Promise<ObjectId[]> {
  const loans = bankLoansCollection(db);
  const filter = {
    ...plainLoansOf(input.fromId),
    status: { $in: [...ASSUMABLE_LOAN_STATUSES] },
  };
  const ids = (await loans.find(filter, { projection: { _id: 1 } }).toArray()).map(
    (loan) => loan._id
  );
  if (ids.length === 0) return [];
  await loans.updateMany({ ...filter, _id: { $in: ids } }, { $set: { borrowerId: input.toId } });
  return ids;
}

/** Hand loans moved by {@link assumeCorporateLoans} back to their borrower. */
export async function restoreCorporateLoans(
  db: Db,
  input: { ids: readonly ObjectId[]; fromId: ObjectId; toId: ObjectId }
): Promise<void> {
  if (input.ids.length === 0) return;
  await bankLoansCollection(db)
    .updateMany(
      { _id: { $in: [...input.ids] }, borrowerType: "corporation", borrowerId: input.toId },
      { $set: { borrowerId: input.fromId } }
    );
}

/**
 * Live loans a corporation owes, for pricing it net of its debt. Secured
 * construction loans are included unless `ordinaryOnly` is set, for callers
 * that already net them through a construction borrower transfer plan.
 */
export async function loadLiveCorporateLoans(
  db: Db,
  borrowerId: ObjectId,
  options: { ordinaryOnly?: boolean } = {}
): Promise<Pick<BankLoan, "_id" | "outstanding" | "currency">[]> {
  return bankLoansCollection(db)
    .find(
      {
        ...(options.ordinaryOnly
          ? plainLoansOf(borrowerId)
          : { borrowerType: "corporation" as const, borrowerId }),
        status: { $in: [...ASSUMABLE_LOAN_STATUSES] },
      },
      { projection: { outstanding: 1, currency: 1 } }
    )
    .toArray();
}
