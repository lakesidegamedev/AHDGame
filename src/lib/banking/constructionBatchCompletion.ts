/**
 * Finish a construction servicing batch that a refused borrower debit left
 * half done.
 *
 * A refused debit is final, so the journal can never land its credit and the
 * bank's lease and the loans' locks stay held for ever. The borrowers whose
 * debits did land were really charged, though, so the batch cannot simply be
 * dropped. Instead the journal is amended in one write to what actually
 * happened: the refused debits and the loans they would have paid are removed,
 * and the bank credit shrinks to the debits that remain. The ordinary resume
 * then lands the credit and the loan projections exactly once. The refused
 * borrower's loans are not advanced, so a later turn services them normally.
 */
import type { Db } from "mongodb";
import type { BankLoan } from "@/lib/db/types/bank";
import { MONEY_MOVE_COLLECTION, type MoneyMoveRecordLeg } from "./moneyMove";
import { reviveObjectIds } from "./settlementEncoding";
import type { TransitionProjection } from "./rules/boundary";
import { bankLoansCollection } from "@/lib/db/repositories/bankLoans";

interface JournalProjection {
  applied?: boolean;
  appliedAt?: Date | null;
  claimedAt?: Date | null;
  projection: TransitionProjection;
}

interface BatchRecord {
  _id: string;
  kind: string;
  status: string;
  genericMoneyMoveVersion?: number;
  legs: MoneyMoveRecordLeg[];
  projections?: JournalProjection[];
}

const legKey = (collection: string, id: unknown, path: string) =>
  `${collection}\u0000${String(reviveObjectIds(id))}\u0000${path}`;

const borrowerLegKey = (loan: BankLoan) =>
  loan.borrowerType === "character"
    ? legKey("characters", loan.borrowerId, `currencyBalances.personal.${loan.currency}`)
    : legKey("corporations", loan.borrowerId, "liquidCapital");

const projectionTarget = (p: JournalProjection) =>
  String(reviveObjectIds(p.projection.filter)?._id);

const totalLoansInc = (p: JournalProjection) =>
  (p.projection.update as { $inc?: Record<string, unknown> } | undefined)?.$inc?.[
    "bankCharter.totalLoans"
  ];

/**
 * Returns true when it amended the journal, so the caller resumes it again.
 * Anything it does not fully recognise is left exactly as it was.
 */
export async function completeRefusedDebitBatch(db: Db, key: string): Promise<boolean> {
  const journal = db.collection<BatchRecord>(MONEY_MOVE_COLLECTION);
  const record = await journal.findOne({ _id: key });
  if (
    !record ||
    record.kind !== "loan_service_construction_batch" ||
    record.status !== "partial" ||
    record.genericMoneyMoveVersion !== 2 ||
    !record.projections
  )
    return false;
  const { legs, projections } = record;
  const creditIndex = legs.findIndex((leg) => leg.kind === "credit");
  const credit = legs[creditIndex];
  if (!credit || legs.filter((leg) => leg.kind === "credit").length !== 1) return false;
  if (credit.applied || credit.refusal) return false;
  const debits = legs.filter((leg) => leg.kind !== "credit");
  if (debits.some((leg) => leg.kind !== "debit")) return false;
  // A debit neither applied nor refused is still pending: the resume stops at
  // the first refusal, so it has not been tried. It stays in the batch.
  const refused = debits.filter((leg) => !leg.applied && leg.refusal);
  const kept = debits.filter((leg) => !refused.includes(leg));
  const sum = (rows: MoneyMoveRecordLeg[]) => rows.reduce((total, leg) => total + leg.amount, 0);
  const credited = sum(kept);
  if (refused.length === 0 || kept.length === 0) return false;
  if (Math.abs(credited + sum(refused) - credit.amount) > Math.max(1e-6, credit.amount * 1e-9))
    return false;
  if (projections.some((p) => p.applied || p.appliedAt || p.claimedAt)) return false;

  const loanIds = projections
    .filter((p) => p.projection.collection === "bankLoans")
    .map((p) => reviveObjectIds(p.projection.filter)?._id);
  const loans = await bankLoansCollection(db)
    .find({ _id: { $in: loanIds } } as never)
    .toArray();
  const loanById = new Map(loans.map((loan) => [String(loan._id), loan]));
  const refusedKeys = new Set(
    refused.map((leg) => legKey(leg.collection ?? "", leg.filter?._id, leg.path ?? ""))
  );
  const refusedLoans = loans.filter((loan) => refusedKeys.has(borrowerLegKey(loan)));
  // Every refused debit must be traced to the loans it was to pay.
  const traced = new Set(refusedLoans.map(borrowerLegKey));
  if ([...refusedKeys].some((k) => !traced.has(k))) return false;
  const refusedIds = new Set(refusedLoans.map((loan) => String(loan._id)));

  let refusedLoanDelta = 0;
  let totalIndex = -1;
  const droppedLoans: string[] = [];
  const next: JournalProjection[] = [];
  for (const p of projections) {
    const { collection } = p.projection;
    if (collection === "bankLoans") {
      const loan = loanById.get(projectionTarget(p));
      if (!loan) return false;
      if (!refusedIds.has(String(loan._id))) {
        next.push(p);
        continue;
      }
      const set = (p.projection.update as { $set?: Record<string, unknown> } | undefined)?.$set;
      const after = Number(set?.outstanding);
      if (!set || !Number.isFinite(after)) return false;
      const before = Math.max(0, loan.outstanding ?? 0);
      // A default writes off what was left; every other outcome only repays principal.
      refusedLoanDelta += set.status === "defaulted" ? -before : -(before - after);
      droppedLoans.push(String(loan._id));
    } else if (collection === "corporations" && typeof totalLoansInc(p) === "number") {
      totalIndex = next.length;
      next.push(p);
    } else if (collection === "corporateSectors") {
      const filter = reviveObjectIds(p.projection.filter) as Record<string, unknown>;
      const owner = loans.find(
        (loan) =>
          String(loan.constructionCollateral?.sectorId) === String(filter._id) &&
          loan.constructionCollateral?.claimId === filter["constructionFinancing.claimId"]
      );
      if (!owner) return false;
      if (!refusedIds.has(String(owner._id))) next.push(p);
    } else {
      return false;
    }
  }
  if (totalIndex >= 0) {
    const inc = Number(totalLoansInc(next[totalIndex])) - refusedLoanDelta;
    const folded = { ...next[totalIndex] };
    folded.projection = {
      ...folded.projection,
      update: { $inc: { "bankCharter.totalLoans": inc } },
    };
    if (Math.abs(inc) < 1e-9) next.splice(totalIndex, 1);
    else next[totalIndex] = folded;
  }

  const amended = await journal.updateOne(
    {
      _id: key,
      status: "partial",
      [`legs.${creditIndex}.applied`]: false,
      [`legs.${creditIndex}.refusal`]: { $exists: false },
      ...Object.fromEntries(
        legs.flatMap((leg, i) =>
          refused.includes(leg) ? [[`legs.${i}.refusal`, leg.refusal]] : []
        )
      ),
    },
    {
      $set: {
        legs: legs
          .filter((leg) => !refused.includes(leg))
          .map((leg) => (leg.kind === "credit" ? { ...leg, amount: credited } : leg)),
        projections: next,
      },
      // The dropped legs and loans stay on the record as the audit trail.
      $push: {
        supersededDebits: {
          $each: refused.map((leg) => ({
            collection: leg.collection,
            filter: leg.filter,
            path: leg.path,
            amount: leg.amount,
            refusal: leg.refusal,
            originalCredit: credit.amount,
            unadvancedLoanIds: droppedLoans,
          })),
        },
      },
      $unset: { error: "" },
    } as never
  );
  return amended.matchedCount === 1;
}
