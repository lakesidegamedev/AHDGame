/**
 * One journaled money move for a whole loan book.
 *
 * Servicing a bank's loans one at a time claims a journal key per loan and
 * pays the full delivery chain per loan: the claim, the debit, the credit, the
 * loan record and an acknowledgement for each of them. That is roughly a dozen
 * and a half database round trips per loan, which is what made a dead bank's
 * book the slowest stage of a production turn.
 *
 * The same book expressed as one move is N borrower debits (one per borrower,
 * summed across that borrower's loans), one summed credit and one projection
 * per loan. The journal still lands every loan record exactly once and under
 * the same turn stamp, but the cash legs cost a handful of writes for the
 * whole book.
 *
 * The decisions are taken before the move, from the same running balance the
 * serial pass used: a borrower's second loan sees what the first one left.
 * That is why the debits can be summed and still leave the same money in the
 * same places.
 *
 * The two counters that used to ride on every loan's own projection, the
 * bank's cached loan total and the insurer's measured recoveries, fold into
 * one increment each, so the batch carries no write per loan beyond the loan
 * record itself.
 */

import type { Db, ObjectId } from "mongodb";
import type { BankLoan } from "@/lib/db/types/bank";
import type { CurrencyCode } from "@/lib/constants/currencies";
import type { MoneyTarget } from "@/lib/banking/moneyMove";
import type { LoanServiceDecision } from "@/lib/banking/rules/loanServicing";
import type {
  BankingTransition,
  TransitionLeg,
  TransitionProjection,
} from "@/lib/banking/rules/boundary";
import { emitBankingAuditEvent } from "@/lib/banking/auditEvents";
import type { TxInput } from "@/lib/financialTxLog/emit";

/** One loan's decided servicing, ready to fold into a bank-level move. */
export type LoanServiceBatchRow = {
  loan: BankLoan;
  decision: LoanServiceDecision;
  transition: BankingTransition;
  /** Borrower and currency, the key the caller's running balance lives under. */
  borrowerKey: string;
  /**
   * False for a household-pool tranche: its cash comes from the central bank,
   * not from a borrower, so no borrower ledger row belongs to it.
   */
  ledger?: boolean;
};

export type LoanServiceBatchTotals = {
  interestCollected: number;
  principalRepaid: number;
  writtenOff: number;
  bankCredit: number;
  /**
   * The cached loan total the rows' decisions advance. Only a move that credits
   * the bank's own reserves carries it; a recovery into the insurer does not.
   */
  totalLoansDelta: number;
};

export type LoanServiceBatchBooks = {
  /** Filter naming the bank epoch whose cached loan total the batch advances. */
  totalLoansFilter: Record<string, unknown>;
  /**
   * Filter naming the insurance fund whose measured recoveries the batch
   * records. When set, the per-loan recovery increments fold into one.
   */
  measuredRecoveryFilter?: Record<string, unknown>;
};

function projectionInc(projection: TransitionProjection): Record<string, unknown> | undefined {
  const update = projection.update;
  if (!update || typeof update !== "object") return undefined;
  const inc = (update as { $inc?: Record<string, unknown> }).$inc;
  return inc && typeof inc === "object" ? inc : undefined;
}

/**
 * The document a leg targets, as a stable map key. Rules-zone legs address
 * their target with an `{ $oid }` ref, which stringifies to "[object Object]";
 * keying on that would merge every borrower's debit into one leg and charge the
 * first borrower for the whole book.
 */
function legTargetKey(leg: TransitionLeg): string {
  const id = leg.filter?._id;
  const stable =
    id && typeof id === "object" && "$oid" in id
      ? String((id as { $oid: unknown }).$oid)
      : String(id);
  return `${String(leg.collection)}\u0000${stable}\u0000${String(leg.path)}`;
}

function isLoanTotalProjection(projection: TransitionProjection): boolean {
  if (projection.collection !== "corporations") return false;
  return typeof projectionInc(projection)?.["bankCharter.totalLoans"] === "number";
}

function isMeasuredRecoveryProjection(projection: TransitionProjection): boolean {
  if (projection.collection !== "depositInsuranceFunds") return false;
  return typeof projectionInc(projection)?.measuredRecoveriesSincePricingStart === "number";
}

/**
 * The legs and projections of one bank-level servicing move. One debit per
 * borrower (and currency) rather than one per loan: the decisions already
 * capped each payment against the running balance, so the sum is what the
 * serial per-loan debits would have taken. Unique targets are what lets the
 * journal deliver the whole run in a batch. Each loan's own book increment
 * folds into one, applied under `totalLoansFilter`.
 */
export function batchedLoanServiceMove(
  rows: readonly LoanServiceBatchRow[],
  creditTarget: MoneyTarget,
  books: LoanServiceBatchBooks,
  /**
   * Debits the rows do not carry because they are not a borrower's: the
   * household pool a tranche repays from. Summed once per pool per currency,
   * with the pool's balance as the guard, before the move is offered.
   */
  pooledDebits: readonly TransitionLeg[] = []
): { legs: TransitionLeg[]; projections: TransitionProjection[] } {
  const totalPayment = rows.reduce((sum, row) => sum + Math.max(0, row.decision.payment), 0);
  const debitByTarget = new Map<string, TransitionLeg>();
  // The pooled debits go in first so a (theoretical) row leg on the same target
  // folds into their guarded amount rather than the other way round.
  for (const leg of pooledDebits) {
    const key = legTargetKey(leg);
    const existing = debitByTarget.get(key);
    if (existing) existing.amount += leg.amount;
    else debitByTarget.set(key, { ...leg });
  }
  for (const row of rows) {
    for (const leg of row.transition.legs) {
      if (leg.kind !== "debit") continue;
      const key = legTargetKey(leg);
      const existing = debitByTarget.get(key);
      if (existing) existing.amount += leg.amount;
      else debitByTarget.set(key, { ...leg });
    }
  }
  const legs: TransitionLeg[] = [...debitByTarget.values()];
  // Stable sort by collection so the batched delivery can group whole runs.
  legs.sort((a, b) => String(a.collection).localeCompare(String(b.collection)));
  if (totalPayment > 0) legs.push({ kind: "credit", amount: totalPayment, ...creditTarget });
  const projections: TransitionProjection[] = [];
  // Only the increments that have a projection are folded: a loan whose
  // payment lands in the insurance fund carries no cached-total projection, so
  // its delta must not reach the bank's book.
  let totalLoansDelta = 0;
  let measuredRecoveries = 0;
  for (const row of rows) {
    for (const projection of row.transition.projections) {
      if (isLoanTotalProjection(projection)) {
        totalLoansDelta += Number(projectionInc(projection)?.["bankCharter.totalLoans"] ?? 0);
        continue;
      }
      if (books.measuredRecoveryFilter && isMeasuredRecoveryProjection(projection)) {
        measuredRecoveries += Number(
          projectionInc(projection)?.measuredRecoveriesSincePricingStart ?? 0
        );
        continue;
      }
      projections.push(projection);
    }
  }
  if (totalLoansDelta !== 0)
    projections.push({
      collection: "corporations",
      filter: books.totalLoansFilter,
      update: { $inc: { "bankCharter.totalLoans": totalLoansDelta } },
      note: "Advance the loan book under the batch servicing receipt",
    });
  if (books.measuredRecoveryFilter && measuredRecoveries > 0)
    projections.push({
      collection: "depositInsuranceFunds",
      filter: books.measuredRecoveryFilter,
      update: { $inc: { measuredRecoveriesSincePricingStart: measuredRecoveries } },
      note: "Record the book's borrower recoveries for a measured resolved insurance claim",
    });
  return { legs, projections };
}

/** One repayment ledger row for a loan whose money landed this turn. */
export function loanRepaymentTxEntry(args: {
  loan: BankLoan;
  turn: number;
  currency: CurrencyCode;
  bankCorporationId: ObjectId;
  bankName: string;
  borrowerName: string;
  payment: number;
  settlementId: string;
}): TxInput {
  return {
    type: "bank_loan_repayment",
    turn: args.turn,
    createdAt: new Date(),
    subjectType: args.loan.borrowerType === "character" ? "character" : "corporation",
    subjectId: args.loan.borrowerId,
    subjectName: args.borrowerName,
    amount: -args.payment,
    currencyCode: args.currency,
    counterpartyType: "corporation",
    counterpartyId: args.bankCorporationId,
    counterpartyName: args.bankName,
    meta: { loanId: args.loan._id.toString(), settlementId: args.settlementId },
  };
}

/**
 * Counts, ledger rows and audit events for a batch whose journal applied. The
 * caller adds the totals to its own summary and flushes the rows with the rest
 * of the bank's ledger writes.
 */
export function recordLoanServiceBatch(args: {
  db: Db;
  rows: readonly LoanServiceBatchRow[];
  turn: number;
  currency: CurrencyCode;
  bankName: string;
  settlementId: string;
  borrowerName: (row: LoanServiceBatchRow) => string;
}): { totals: LoanServiceBatchTotals; txEntries: TxInput[] } {
  const totals: LoanServiceBatchTotals = {
    interestCollected: 0,
    principalRepaid: 0,
    writtenOff: 0,
    bankCredit: 0,
    totalLoansDelta: 0,
  };
  const txEntries: TxInput[] = [];
  for (const row of args.rows) {
    totals.interestCollected += row.decision.interestPaid;
    totals.principalRepaid += row.decision.principalPaid;
    totals.writtenOff += row.decision.writtenOff;
    totals.totalLoansDelta += row.decision.totalLoansDelta;
    totals.bankCredit += Math.max(0, row.decision.payment);
    if (row.decision.payment > 0 && row.ledger !== false) {
      txEntries.push(
        loanRepaymentTxEntry({
          loan: row.loan,
          turn: args.turn,
          currency: args.currency,
          bankCorporationId: row.loan.bankCorporationId,
          bankName: args.bankName,
          borrowerName: args.borrowerName(row),
          payment: row.decision.payment,
          settlementId: args.settlementId,
        })
      );
    }
    emitBankingAuditEvent(
      {
        ...row.transition.event,
        turn: args.turn,
        outcome: "ok",
        currency: args.currency,
        bankId: row.loan.bankCorporationId.toString(),
        settlementId: args.settlementId,
      },
      args.db
    );
  }
  return { totals, txEntries };
}
