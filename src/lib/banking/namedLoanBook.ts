/**
 * Named loan servicing: the per-loan path and the bank-level batch.
 *
 * A bank services its plain loan book in one journaled move per turn (N
 * borrower debits, one summed credit, one projection per loan), and its
 * construction book in a second one held under a single bank lease. Loans
 * another receipt still owns keep the per-loan path because they own their own
 * locks.
 */
import type { Db, ObjectId } from "mongodb";
import type { Character, Corporation } from "@/lib/db/types";
import type { BankLoan } from "@/lib/db/types/bank";
import type { CurrencyCode } from "@/lib/constants/currencies";
import type { MoneyTarget } from "@/lib/banking/moneyMove";
import { loanServiceTransition, loanServiceKey } from "@/lib/banking/rules/loanServicing";
import { settleTransition } from "@/lib/banking/settlementJournal";
import {
  acquireConstructionLoanLock,
  releaseConstructionLoanLock,
} from "@/lib/banking/constructionLoanLock";
import {
  acquireConstructionServiceLease,
  releaseConstructionServiceLease,
} from "@/lib/banking/constructionServiceLease";
import { emitTx, emitTxBulk, loadTxThresholds, type TxInput } from "@/lib/financialTxLog/emit";
import { emitBankingAuditEvent } from "@/lib/banking/auditEvents";
import { loanCharterEpochFilter } from "@/lib/banking/loanEpoch";
import {
  batchedLoanServiceMove,
  loanRepaymentTxEntry,
  recordLoanServiceBatch,
  type LoanServiceBatchRow,
} from "@/lib/banking/loanServiceBatch";

export type LoanServiceResult = {
  interestCollected: number;
  principalRepaid: number;
  writtenOff: number;
  bankCredit: number;
  totalLoansDelta: number;
  /** Payment that actually left the borrower this pass (for the preloaded balance). */
  paidLocal: number;
  /** The settlement was already applied by an earlier attempt; the preload is stale. */
  replayed: boolean;
  /** Some legs landed but the move did not finish; the preload may be stale. */
  partial: boolean;
};

export async function servicePlayerLoan(
  db: Db,
  turn: number,
  bankCorporationId: ObjectId,
  loan: BankLoan,
  currency: CurrencyCode,
  bankName: string,
  /**
   * Where the payment lands. A live bank's vault for a normal turn; whoever
   * stood behind the bank when it was wound up, if the lender is dead. The
   * servicing arithmetic is identical either way, so it is a parameter rather
   * than a second copy of this function.
   */
  creditTarget: MoneyTarget = {
    collection: "corporations",
    filter: { _id: bankCorporationId },
    path: "bankCharter.cashReserves",
    note: "instalment reaches the lending bank",
  },
  trackInsuranceRecovery = false,
  /**
   * When supplied, the repayment's financial-tx row is queued here and the
   * caller flushes the whole bank's rows with one emitTxBulk (one thresholds
   * read, one anchor-rate map, one insertMany) instead of one emitTx per loan.
   */
  txEntries?: TxInput[],
  /**
   * Balance and name read once per borrower for the whole bank pass. The
   * caller keeps the running balance between that borrower's loans, which is
   * exactly what the per-loan read saw after each settled debit.
   */
  preloadedBorrower?: { available: number; name: string }
): Promise<LoanServiceResult> {
  const empty: LoanServiceResult = {
    interestCollected: 0,
    principalRepaid: 0,
    writtenOff: 0,
    bankCredit: 0,
    totalLoansDelta: 0,
    paidLocal: 0,
    replayed: false,
    partial: false,
  };
  if (loan.lastProcessedTurn === turn) return empty;
  if (loan.constructionCollateral) {
    const owned = await acquireConstructionLoanLock(
      db,
      loan,
      loanServiceKey(String(loan._id), turn)
    );
    if (!owned) return empty;
    loan = owned;
    if (!["current", "arrears"].includes(loan.status) || loan.lastProcessedTurn === turn) {
      await releaseConstructionLoanLock(db, loan, loanServiceKey(String(loan._id), turn));
      return empty;
    }
  }
  const serviceKey = loanServiceKey(String(loan._id), turn);
  const holdBankEpoch =
    !!loan.constructionCollateral &&
    creditTarget.collection === "corporations" &&
    creditTarget.path === "bankCharter.cashReserves";
  if (holdBankEpoch) {
    if (!(await acquireConstructionServiceLease(db, loan, serviceKey, turn))) {
      await releaseConstructionLoanLock(db, loan, serviceKey);
      return empty;
    }
    creditTarget = {
      ...creditTarget,
      filter: {
        ...creditTarget.filter,
        "bankCharter.charteredTurn": loan.charteredTurn,
        "bankConstructionFunding.kind": "servicing",
        "bankConstructionFunding.service.key": serviceKey,
      },
    };
  }
  const releaseService = async () => {
    if (holdBankEpoch)
      await releaseConstructionServiceLease(db, bankCorporationId, loan._id, serviceKey);
    else await releaseConstructionLoanLock(db, loan, serviceKey);
  };

  // The decision is pure; the transition carries the borrower's debit, the
  // lender's credit and the loan-document update guarded on the turn stamp.
  // The journal lands all of it exactly once under the per-loan-per-turn key,
  // so a retried turn can neither charge the borrower twice nor advance the
  // loan twice, and a crash between money and record is a visible partial.
  const { available, name: borrowerName } =
    preloadedBorrower ?? (await readBorrowerAvailable(db, loan, currency));
  const { decision, transition } = loanServiceTransition({
    loan,
    borrowerAvailable: available,
    turn,
    creditTarget: {
      collection: creditTarget.collection,
      filter: creditTarget.filter,
      path: creditTarget.path,
      note: creditTarget.note,
    },
    bankId: bankCorporationId.toString(),
    trackInsuranceRecovery,
  });
  if (decision.outcome === "closed") {
    const closed = await settleTransition(db, transition);
    if (!closed.error && ["applied", "replayed"].includes(closed.status)) await releaseService();
    return empty;
  }

  const settled = await settleTransition(db, transition);
  if (
    (!settled.error && ["applied", "replayed"].includes(settled.status)) ||
    (settled.status === "rejected" &&
      settled.appliedLegs.length === 0 &&
      settled.appliedProjections.length === 0)
  )
    await releaseService();
  if (settled.status === "rejected") return empty;
  const moneyLanded =
    transition.legs.length > 0 && settled.appliedLegs.length === transition.legs.length;
  const advanced = settled.appliedProjections.length === transition.projections.length;

  if (settled.status === "applied" && moneyLanded && decision.payment > 0) {
    const entry: TxInput = loanRepaymentTxEntry({
      loan,
      turn,
      currency,
      bankCorporationId: loan.bankCorporationId,
      bankName,
      borrowerName,
      payment: decision.payment,
      settlementId: transition.key,
    });
    if (txEntries) txEntries.push(entry);
    else await emitTx(db, entry);
  }
  if (settled.status === "applied" && advanced) {
    emitBankingAuditEvent(
      {
        ...transition.event,
        turn,
        outcome: "ok",
        currency,
        bankId: bankCorporationId.toString(),
        settlementId: transition.key,
      },
      db
    );
  }

  // What this pass may count: the money that actually landed, and the book
  // movement only when the loan record advanced.
  const collected = moneyLanded ? decision.payment : 0;
  return {
    interestCollected: advanced ? decision.interestPaid : 0,
    principalRepaid: advanced ? decision.principalPaid : 0,
    writtenOff: advanced ? decision.writtenOff : 0,
    bankCredit: collected,
    totalLoansDelta: advanced ? decision.totalLoansDelta : 0,
    paidLocal: collected,
    replayed: settled.status === "replayed",
    partial: settled.status === "partial",
  };
}

async function readBorrowerAvailable(
  db: Db,
  loan: BankLoan,
  currency: CurrencyCode
): Promise<{ available: number; name: string }> {
  if (!loan.borrowerId) return { available: 0, name: "Borrower" };
  if (loan.borrowerType === "character") {
    const ch = await db
      .collection<Character>("characters")
      .findOne(
        { _id: loan.borrowerId },
        { projection: { name: 1, [`currencyBalances.personal.${currency}`]: 1 } }
      );
    return {
      available: Math.max(0, ch?.currencyBalances?.personal?.[currency] ?? 0),
      // The ledger leg needs the name; read it with the balance instead of
      // paying a second round trip per serviced loan.
      name: ch?.name ?? "Borrower",
    };
  }
  const corp = await db
    .collection<Corporation>("corporations")
    .findOne({ _id: loan.borrowerId }, { projection: { name: 1, liquidCapital: 1 } });
  return {
    available: Math.max(0, corp?.liquidCapital ?? 0),
    name: corp?.name ?? "Borrower",
  };
}

export async function serviceNamedLoanBook(
  db: Db,
  turn: number,
  corp: Pick<Corporation, "_id" | "name">,
  currency: CurrencyCode,
  charteredTurn: number
): Promise<LoanServiceResult> {
  const total: LoanServiceResult = {
    interestCollected: 0,
    principalRepaid: 0,
    writtenOff: 0,
    bankCredit: 0,
    totalLoansDelta: 0,
    paidLocal: 0,
    replayed: false,
    partial: false,
  };
  const loans = await db
    .collection<BankLoan>("bankLoans")
    .find({
      bankCorporationId: corp._id,
      borrowerType: { $in: ["character", "corporation"] },
      status: { $in: ["current", "arrears"] },
      lastProcessedTurn: { $ne: turn },
      ...loanCharterEpochFilter(charteredTurn),
    })
    .toArray();

  const loansByBorrower = new Map<string, typeof loans>();
  for (const loan of loans) {
    const key = `${loan.borrowerType}:${String(loan.borrowerId)}`;
    const list = loansByBorrower.get(key) ?? [];
    list.push(loan);
    loansByBorrower.set(key, list);
  }

  // Preload every borrower's balance and name once per bank instead of once
  // per loan. The banking pass is the only writer to these balances this turn
  // (its keyed locks include every borrower), so the running balance below is
  // exactly what the per-loan read saw after each settled debit.
  const borrowerKeyOf = (loan: (typeof loans)[number]) =>
    `${loan.borrowerType}:${String(loan.borrowerId)}:${loan.currency}`;
  const characterIds = new Map<string, ObjectId>();
  const corporationIds = new Map<string, ObjectId>();
  for (const loan of loans) {
    if (!loan.borrowerId) continue;
    if (loan.borrowerType === "character")
      characterIds.set(String(loan.borrowerId), loan.borrowerId);
    else if (loan.borrowerType === "corporation")
      corporationIds.set(String(loan.borrowerId), loan.borrowerId);
  }
  const [preloadChars, preloadCorps] = await Promise.all([
    characterIds.size
      ? db
          .collection<Character>("characters")
          .find(
            { _id: { $in: [...characterIds.values()] } },
            { projection: { name: 1, "currencyBalances.personal": 1 } }
          )
          .toArray()
      : Promise.resolve([]),
    corporationIds.size
      ? db
          .collection<Corporation>("corporations")
          .find(
            { _id: { $in: [...corporationIds.values()] } },
            { projection: { name: 1, liquidCapital: 1 } }
          )
          .toArray()
      : Promise.resolve([]),
  ]);
  const charById = new Map(preloadChars.map((row) => [String(row._id), row]));
  const corpById = new Map(preloadCorps.map((row) => [String(row._id), row]));
  const borrowerState = new Map<string, { available: number; name: string }>();
  for (const loan of loans) {
    if (!loan.borrowerId) continue;
    const key = borrowerKeyOf(loan);
    if (borrowerState.has(key)) continue;
    if (loan.borrowerType === "character") {
      const ch = charById.get(String(loan.borrowerId));
      // A missing document falls back to the per-loan read, which returns the
      // same zero but keeps a mocked/partial collection from inventing a
      // borrower state that the real code would not have.
      if (!ch) continue;
      borrowerState.set(key, {
        available: Math.max(0, ch.currencyBalances?.personal?.[loan.currency] ?? 0),
        name: ch.name ?? "Borrower",
      });
    } else if (loan.borrowerType === "corporation") {
      const corporation = corpById.get(String(loan.borrowerId));
      if (!corporation) continue;
      borrowerState.set(key, {
        available: Math.max(0, corporation.liquidCapital ?? 0),
        name: corporation.name ?? "Borrower",
      });
    }
  }

  const txEntries: TxInput[] = [];
  const serviceBorrower = async (borrowerLoans: typeof loans) => {
    for (const loan of borrowerLoans) {
      const key = borrowerKeyOf(loan);
      const preloaded = borrowerState.get(key);
      const loanResult = await servicePlayerLoan(
        db,
        turn,
        corp._id,
        loan,
        currency,
        corp.name,
        undefined,
        false,
        txEntries,
        preloaded
      );
      total.interestCollected += loanResult.interestCollected;
      total.principalRepaid += loanResult.principalRepaid;
      total.writtenOff += loanResult.writtenOff;
      total.bankCredit += loanResult.bankCredit;
      total.totalLoansDelta += loanResult.totalLoansDelta;
      if (preloaded) {
        // A replay or a partial move may have changed the balance behind this
        // snapshot; drop it so the next loan on the borrower reads the truth.
        if (loanResult.replayed || loanResult.partial) borrowerState.delete(key);
        else if (loanResult.paidLocal > 0)
          preloaded.available = Math.max(0, preloaded.available - loanResult.paidLocal);
      }
    }
  };
  const borrowerGroups = [...loansByBorrower.values()];
  const constructionGroups = borrowerGroups.filter((group) =>
    group.some((loan) => loan.constructionCollateral)
  );

  // One journaled move for the bank's plain book: N borrower debits, one
  // summed bank credit, one loan projection per loan. Decisions still use the
  // running balance a borrower's previous loan left, exactly as the serial
  // per-loan pass did. Construction receipts (one lender epoch, their own
  // locks) run their own batch below.
  const plainLoans = loans.filter((loan) => !loan.constructionCollateral);
  const batchable = plainLoans.filter(
    (loan) => !!loan.borrowerId && loan.lastProcessedTurn !== turn
  );
  const creditTarget: MoneyTarget = {
    collection: "corporations",
    filter: { _id: corp._id },
    path: "bankCharter.cashReserves",
    note: "instalment reaches the lending bank",
  };
  const decide = async (batchLoans: readonly BankLoan[], target: MoneyTarget) => {
    const decisions: LoanServiceBatchRow[] = [];
    for (const loan of batchLoans) {
      const key = borrowerKeyOf(loan);
      const preloaded = borrowerState.get(key);
      const available =
        preloaded?.available ?? (await readBorrowerAvailable(db, loan, currency)).available;
      const { decision, transition } = loanServiceTransition({
        loan,
        borrowerAvailable: available,
        turn,
        creditTarget: target,
        bankId: corp._id.toString(),
      });
      if (preloaded) preloaded.available = Math.max(0, preloaded.available - decision.payment);
      decisions.push({ loan, decision, transition, borrowerKey: key });
    }
    return decisions;
  };
  // Counts and ledger rows for a batch whose journal applied.
  const recordApplied = (decisions: readonly LoanServiceBatchRow[], settlementId: string) => {
    const recorded = recordLoanServiceBatch({
      db,
      rows: decisions,
      turn,
      currency,
      bankName: corp.name,
      settlementId,
      borrowerName: (row) => borrowerState.get(row.borrowerKey)?.name ?? "Borrower",
    });
    total.interestCollected += recorded.totals.interestCollected;
    total.principalRepaid += recorded.totals.principalRepaid;
    total.writtenOff += recorded.totals.writtenOff;
    total.totalLoansDelta += recorded.totals.totalLoansDelta;
    total.bankCredit += recorded.totals.bankCredit;
    txEntries.push(...recorded.txEntries);
  };
  // A refused batch moved nothing: each loan retries on its own key and guard.
  const servicePerLoan = async (decisions: readonly LoanServiceBatchRow[]) => {
    for (const row of decisions) {
      const loanResult = await servicePlayerLoan(
        db,
        turn,
        corp._id,
        row.loan,
        currency,
        corp.name,
        undefined,
        false,
        txEntries
      );
      total.interestCollected += loanResult.interestCollected;
      total.principalRepaid += loanResult.principalRepaid;
      total.writtenOff += loanResult.writtenOff;
      total.bankCredit += loanResult.bankCredit;
      total.totalLoansDelta += loanResult.totalLoansDelta;
      borrowerState.delete(row.borrowerKey);
    }
  };

  const decisions = await decide(batchable, creditTarget);
  if (decisions.length > 0) {
    const batchKey = `loan-service-batch:${corp._id.toString()}:${turn}`;
    const settled = await settleTransition(db, {
      ...batchedLoanServiceMove(decisions, creditTarget, {
        totalLoansFilter: {
          _id: corp._id,
          "bankCharter.charteredTurn": charteredTurn,
        },
      }),
      key: batchKey,
      kind: "loan_service_batch",
      turn,
      currency,
      batchIndependentDebits: true,
      event: {
        kind: "monetary.executed",
        command: "turn.loanService.batch",
        subjectType: "corporation",
        subjectId: corp._id.toString(),
        amount: decisions.reduce((sum, row) => sum + Math.max(0, row.decision.payment), 0),
        meta: { loans: decisions.length },
      },
    });
    if (settled.status === "applied") recordApplied(decisions, batchKey);
    else if (settled.status === "partial") total.partial = true;
    else if (settled.status === "rejected") await servicePerLoan(decisions);
    // replayed: the batch key already owns this turn's servicing. The loan
    // records carry lastProcessedTurn, so there is nothing further to write.
  }

  // Construction loans: one bank lease and one journaled move for the whole
  // book, instead of a lease, a settlement and a release per loan. The lease
  // still holds the lender's epoch for the batch, and every loan the batch
  // owns is locked under the batch key. A loan another receipt still owns
  // (an unfinished build, an older instalment) keeps the per-loan path, which
  // knows how to recover it.
  // Only the collateralised loans: a construction borrower's plain loans were
  // serviced by the plain batch above, and must not be charged again here.
  const constructionLoans = constructionGroups
    .flat()
    .filter((loan) => !!loan.constructionCollateral);
  const leftovers = constructionLoans.length
    ? await serviceConstructionBatch(constructionLoans)
    : [];
  const leftoverGroups = new Map<string, BankLoan[]>();
  for (const loan of leftovers) {
    const key = `${loan.borrowerType}:${String(loan.borrowerId)}`;
    leftoverGroups.set(key, [...(leftoverGroups.get(key) ?? []), loan]);
  }
  for (const group of leftoverGroups.values()) await serviceBorrower(group);
  if (txEntries.length > 0) await emitTxBulk(db, txEntries, await loadTxThresholds(db));
  return total;

  async function serviceConstructionBatch(candidates: readonly BankLoan[]): Promise<BankLoan[]> {
    const key = `loan-service-construction-batch:${corp._id.toString()}:${turn}`;
    const bankLoans = db.collection<BankLoan>("bankLoans");
    // The lease is taken first and names every candidate, and the locks are
    // released before it. Recovery finds a batch only through its lease, so no
    // crash between the two can leave a batch-key lock nobody can clear.
    const anchor = candidates.find((loan) => loan.charteredTurn === charteredTurn);
    if (!anchor) return [...candidates];
    const leased = await acquireConstructionServiceLease(
      db,
      anchor,
      key,
      turn,
      "servicing",
      candidates.map((loan) => String(loan._id))
    );
    // The bank is busy with another funding move this turn, which would have
    // refused every per-loan lease too.
    if (!leased) return [];
    // Every candidate, the anchor included, so even a one-loan batch releases
    // its locks before its lease.
    const batchIds = candidates.map((loan) => loan._id);
    const releaseLease = () =>
      releaseConstructionServiceLease(db, corp._id, anchor._id, key, "servicing", batchIds);

    await bankLoans.updateMany(
      {
        _id: { $in: batchIds },
        $or: [
          { constructionSettlementOwner: { $exists: false } },
          { constructionSettlementOwner: key },
        ],
      },
      { $set: { constructionSettlementOwner: key } }
    );
    const ownedById = new Map(
      (
        await bankLoans.find({ _id: { $in: batchIds }, constructionSettlementOwner: key }).toArray()
      ).map((loan) => [String(loan._id), loan])
    );
    // The original book order, not the store's: payments draw each borrower's
    // running balance down in exactly the order the serial path used.
    const owned = candidates.flatMap((loan) => ownedById.get(String(loan._id)) ?? []);
    const foreign = candidates.filter((loan) => !ownedById.has(String(loan._id)));
    // The per-loan path skips these too: a settled turn, a closed loan, no
    // borrower to charge, or an epoch the bank's lease cannot name.
    const serviceable = (loan: BankLoan) =>
      ["current", "arrears"].includes(loan.status) && loan.lastProcessedTurn !== turn;
    const due = owned.filter(
      (loan) => serviceable(loan) && !!loan.borrowerId && loan.charteredTurn === charteredTurn
    );
    // Another defined epoch keeps the per-loan path, which leases it on its own.
    const otherEpoch = owned.filter(
      (loan) =>
        serviceable(loan) &&
        loan.charteredTurn !== undefined &&
        loan.charteredTurn !== charteredTurn
    );
    if (due.length === 0) {
      await releaseLease();
      return [...foreign, ...otherEpoch];
    }
    const dueIds = new Set(due.map((loan) => String(loan._id)));
    const idle = owned.filter((loan) => !dueIds.has(String(loan._id)));
    if (idle.length > 0)
      await bankLoans.updateMany(
        { _id: { $in: idle.map((loan) => loan._id) }, constructionSettlementOwner: key },
        { $unset: { constructionSettlementOwner: "" } }
      );
    const target: MoneyTarget = {
      ...creditTarget,
      filter: {
        _id: corp._id,
        "bankCharter.charteredTurn": charteredTurn,
        "bankConstructionFunding.kind": "servicing",
        "bankConstructionFunding.service.key": key,
      },
    };
    const rows = await decide(due, target);
    const settled = await settleTransition(db, {
      ...batchedLoanServiceMove(rows, target, { totalLoansFilter: target.filter }),
      key,
      kind: "loan_service_construction_batch",
      turn,
      currency,
      batchIndependentDebits: true,
      event: {
        kind: "monetary.executed",
        command: "turn.loanService.constructionBatch",
        subjectType: "corporation",
        subjectId: corp._id.toString(),
        amount: rows.reduce((sum, row) => sum + Math.max(0, row.decision.payment), 0),
        meta: { loans: rows.length },
      },
    });
    // Released exactly as the per-loan path released its lease: on a clean
    // landing, or on a refusal that moved nothing. A replay that reports an
    // error means another attempt owns the key with legs still outstanding;
    // the lease guards that move's credit, so it stays for recovery.
    const landed =
      !settled.error && (settled.status === "applied" || settled.status === "replayed");
    const refused =
      settled.status === "rejected" &&
      settled.appliedLegs.length === 0 &&
      settled.appliedProjections.length === 0;
    if (landed) {
      if (settled.status === "applied") recordApplied(rows, key);
      await releaseLease();
    } else if (refused) {
      await releaseLease();
      await servicePerLoan(rows);
    } else {
      // Partial: the lease and the loan locks stay with the journal, and the
      // next turn's recovery resumes it before anything else touches them.
      total.partial = true;
    }
    return [...foreign, ...otherEpoch];
  }
}
