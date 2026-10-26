/**
 * Loans outstanding to a bank that no longer exists.
 *
 * The banking turn services banks whose charter is `active`, which is correct
 * for everything except the loans a dead bank leaves behind. Those loans were
 * simply never serviced again: the borrower stopped paying, the asset sat on a
 * revoked charter at full value forever, and the money that should have reached
 * the people who lost out when the bank failed reached nobody. Every comment in
 * the wind-up paths said "loans are LEFT IN PLACE and keep amortizing", and
 * none of them did.
 *
 * A loan is an obligation to whoever holds it, and a bank failing does not
 * discharge it. What changes is who the payment is owed to:
 *
 *  - **Before the deposit book is resolved**, it is owed to the bank, and it
 *    lands in the same `cashReserves` the resolution waterfall is about to
 *    distribute. A recovery that arrives in time simply makes the waterfall
 *    bigger, which is exactly what it is for.
 *  - **After resolution has closed**, the claimants are gone: the household
 *    book was made whole by the insurance fund and the treasury behind it, and
 *    the owner has taken whatever residual there was. A late recovery therefore
 *    belongs to the insurer that stood in, so it is paid into the currency's
 *    deposit insurance fund. That is subrogation, and it is the only
 *    destination that does not either strand the money on a dead charter or
 *    hand a windfall to a shareholder who has already been paid out.
 *  - **If the charter is already archived**, no live resolution pass can
 *    distribute its snapshot, so recovery goes to the insurer as a safe
 *    fallback for legacy data that predates the unresolved-estate guard.
 *
 * Both destinations go through the same money primitive under a deterministic
 * per-turn key (the book's batch key, or the loan's own key when it cannot join
 * the batch), so a retried turn cannot charge a borrower twice.
 *
 * A whole epoch's book is serviced in one journaled move: the decisions are
 * still taken loan by loan against a running borrower balance, but the debits
 * are summed per borrower, the credit is summed once and the loan records ride
 * the same receipt. The per-loan path remains for the loans that cannot join
 * it: household-pool tranches (whose cash comes from the central bank rather
 * than a borrower) and collateralised construction loans (which own a lease
 * and a loan lock per receipt).
 */

import type { Db, ObjectId } from "mongodb";
import { lifecycleStage, stageAllows } from "@/lib/banking/rules/lifecycle";
import type { Character, Corporation } from "@/lib/db/types";
import type { BankCharterHistoryEntry, BankLoan } from "@/lib/db/types/bank";
import type { CurrencyCode } from "@/lib/constants/currencies";
import { getCountryIdForCurrency } from "@/lib/constants/currencies";
import { getBankId } from "@/lib/centralBank/helpers";
import type { MoneyTarget } from "@/lib/banking/moneyMove";
import { ensureFund } from "@/lib/banking/insurance";
import { loanServiceTransition } from "@/lib/banking/rules/loanServicing";
import { settleTransition } from "@/lib/banking/settlementJournal";
import {
  batchedLoanServiceMove,
  recordLoanServiceBatch,
  type LoanServiceBatchRow,
} from "@/lib/banking/loanServiceBatch";
import { emitTxBulk, loadTxThresholds, type TxInput } from "@/lib/financialTxLog/emit";

export type DeadBankLoanSummary = {
  /** Loans belonging to a wound-up bank that were serviced this turn. */
  loansServiced: number;
  interestCollected: number;
  principalRepaid: number;
  defaultsWrittenOff: number;
  /** Cash recovered into a bank still awaiting resolution. */
  recoveredToEstate: number;
  /** Cash recovered into the insurance fund after resolution closed. */
  recoveredToInsurer: number;
};

export const ZERO_DEAD_BANK_SUMMARY: DeadBankLoanSummary = {
  loansServiced: 0,
  interestCollected: 0,
  principalRepaid: 0,
  defaultsWrittenOff: 0,
  recoveredToEstate: 0,
  recoveredToInsurer: 0,
};

type DeadBank = {
  corporationId: Corporation["_id"];
  name: string;
  currency: CurrencyCode;
  charteredTurn: number;
  nextCharteredTurn?: number;
  historyId?: BankCharterHistoryEntry["_id"];
  /** Completion turn of the deposit-insurance resolution for this epoch. */
  resolvedTurn?: number;
  /** Resolution that actually paid a measured insurance claim. */
  measuredClaimTurn?: number;
  /** True once the deposit book has been returned and the estate is closed. */
  resolved: boolean;
};

/** Banks whose charter has ended but whose loan book has not. */
export async function findDeadBanksWithLoans(db: Db): Promise<DeadBank[]> {
  const history = await db
    .collection<BankCharterHistoryEntry>("bankCharterHistory")
    .find(
      {},
      {
        projection: {
          corporationId: 1,
          // Every field `lifecycleStage` reads, plus the two stamps the
          // recovery routing below needs: the archived charter decides whether
          // the estate is open, exactly as the full document did.
          "charter.type": 1,
          "charter.status": 1,
          "charter.warningBand": 1,
          "charter.capitalStanding": 1,
          "charter.undercapitalizedSinceTurn": 1,
          "charter.depositorsResolvedTurn": 1,
          "charter.resolutionClaimedTurn": 1,
          "charter.failedTurn": 1,
          "charter.revokedTurn": 1,
          "charter.currency": 1,
          "charter.charteredTurn": 1,
          "charter.insuranceResolutionTurn": 1,
          "charter.insuranceMeasuredClaimTurn": 1,
        },
      }
    )
    .toArray();
  const historicalCorporationIds = [
    ...new Map(
      history.map((entry) => [entry.corporationId.toString(), entry.corporationId])
    ).values(),
  ];
  const corps = await db
    .collection<Corporation>("corporations")
    .find({
      $or: [
        { "bankCharter.status": { $in: ["failed", "revoked"] } },
        ...(historicalCorporationIds.length > 0
          ? [{ _id: { $in: historicalCorporationIds } }]
          : []),
      ],
    })
    .project<Pick<Corporation, "_id" | "name" | "bankCharter">>({
      name: 1,
      bankCharter: 1,
    })
    .toArray();
  const turnsByCorporation = new Map<string, Set<number>>();
  const addEpoch = (corporationId: Corporation["_id"], charteredTurn: number) => {
    const key = corporationId.toString();
    const turns = turnsByCorporation.get(key) ?? new Set<number>();
    turns.add(charteredTurn);
    turnsByCorporation.set(key, turns);
  };
  for (const entry of history) addEpoch(entry.corporationId, entry.charter.charteredTurn);
  for (const corp of corps) {
    if (corp.bankCharter) addEpoch(corp._id, corp.bankCharter.charteredTurn);
  }
  const nextEpoch = (corporationId: Corporation["_id"], charteredTurn: number) => {
    return [...(turnsByCorporation.get(corporationId.toString()) ?? [])]
      .filter((turn) => turn > charteredTurn)
      .sort((a, b) => a - b)[0];
  };
  const nextEpochField = (corporationId: Corporation["_id"], charteredTurn: number) => {
    const nextCharteredTurn = nextEpoch(corporationId, charteredTurn);
    return nextCharteredTurn === undefined ? {} : { nextCharteredTurn };
  };
  const deadBanks = corps
    .filter((corp) => corp.bankCharter && corp.bankCharter.status !== "active")
    .map((corp) => ({
      corporationId: corp._id,
      name: corp.name,
      currency: corp.bankCharter!.currency as CurrencyCode,
      charteredTurn: corp.bankCharter!.charteredTurn,
      resolvedTurn: corp.bankCharter!.insuranceResolutionTurn,
      measuredClaimTurn: corp.bankCharter!.insuranceMeasuredClaimTurn,
      ...nextEpochField(corp._id, corp.bankCharter!.charteredTurn),
      // A revoked charter has already run the waterfall on the way out, so its
      // estate is closed the moment it is revoked. A failed one is closed only
      // once the resolution sweep has stamped it.
      resolved: stageAllows(lifecycleStage(corp.bankCharter), "windDownEstate"),
    }));
  const nameById = new Map(corps.map((corp) => [corp._id.toString(), corp.name]));
  const liveEstateEpochs = new Set(
    corps
      .filter((corp) => corp.bankCharter && corp.bankCharter.status !== "active")
      .map((corp) => `${corp._id.toString()}:${corp.bankCharter!.charteredTurn}`)
  );
  deadBanks.push(
    ...history
      .filter((entry) => entry.charter.status === "failed" || entry.charter.status === "revoked")
      .map((entry) => ({
        corporationId: entry.corporationId,
        name: nameById.get(entry.corporationId.toString()) ?? "Former bank",
        currency: entry.charter.currency as CurrencyCode,
        charteredTurn: entry.charter.charteredTurn,
        resolvedTurn: entry.charter.insuranceResolutionTurn,
        measuredClaimTurn: entry.charter.insuranceMeasuredClaimTurn,
        ...nextEpochField(entry.corporationId, entry.charter.charteredTurn),
        historyId: entry._id,
        // Once replaced, a failed snapshot has no live waterfall to distribute
        // it. Old deployments could archive before resolution, so use insurance.
        resolved:
          !liveEstateEpochs.has(
            `${entry.corporationId.toString()}:${entry.charter.charteredTurn}`
          ) || stageAllows(lifecycleStage(entry.charter), "windDownEstate"),
      }))
  );

  // Type switches can archive the same charter epoch more than once. Keep one
  // recovery owner per originating epoch, preferring the resolved snapshot.
  const byEpoch = new Map<string, DeadBank>();
  for (const bank of deadBanks) {
    const key = `${bank.corporationId.toString()}:${bank.charteredTurn}`;
    const prior = byEpoch.get(key);
    if (!prior || (bank.resolved && !prior.resolved)) byEpoch.set(key, bank);
  }
  return [...byEpoch.values()];
}

/** Where a payment to this dead bank should land. */
export function recoveryTargetFor(
  bank: Pick<DeadBank, "corporationId" | "name" | "currency" | "resolved" | "historyId">
): MoneyTarget {
  // An archived snapshot has no active resolution waterfall to distribute its
  // reserve balance. Route these legacy recoveries to the insurer rather than
  // strand cash in a history document no later pass will debit.
  if (bank.historyId) {
    return {
      collection: "depositInsuranceFunds",
      filter: { _id: bank.currency },
      path: "balance",
      note: `recovery for ${bank.name}'s archived loan book goes to the insurer`,
    };
  }
  if (!bank.resolved) {
    return {
      collection: "corporations",
      filter: { _id: bank.corporationId },
      path: "bankCharter.cashReserves",
      note: `recovery into ${bank.name}'s estate, before it is distributed`,
    };
  }
  return {
    collection: "depositInsuranceFunds",
    filter: { _id: bank.currency },
    path: "balance",
    note: `recovery to the insurer that stood behind ${bank.name}`,
  };
}

/**
 * Everything the servicing pass can know about a loan before it services it.
 * The per-loan path used to read the borrower (and the currency's household
 * pool) once per loan; both are turn-level facts read once per cohort now.
 */
export type DeadBankLoanPrefetch = {
  /** Borrower cash and name, kept in sync between that borrower's loans. */
  borrower?: { available: number; name: string };
  /** Central-bank household pool for an `npcBulk` tranche, kept in sync likewise. */
  householdPool?: number;
};

/** One loan's servicing result, with the balance movement the prefetch must follow. */
export type DeadBankLoanServiceResult = {
  collected: number;
  interestCollected: number;
  principalRepaid: number;
  writtenOff: number;
  /** Cash that actually left the borrower this pass. */
  paidLocal?: number;
  /** The settlement was already applied; the prefetched balance is stale. */
  replayed?: boolean;
  /** Some legs landed; the prefetched balance may be stale. */
  partial?: boolean;
};

type DeadBankLoanPrefetchState = {
  borrowerState: Map<string, { available: number; name: string }>;
  householdPoolByCurrency: Map<CurrencyCode, number>;
};

function borrowerKeyOf(loan: BankLoan): string {
  return `${loan.borrowerType}:${String(loan.borrowerId)}:${loan.currency}`;
}

/** True when the loan belongs to this charter epoch, matching `loanCharterEpochFilter`. */
function loanInEpoch(loan: BankLoan, charteredTurn: number, nextCharteredTurn?: number): boolean {
  if (loan.charteredTurn !== undefined) return loan.charteredTurn === charteredTurn;
  const originated = loan.originatedTurn;
  if (typeof originated !== "number") return false;
  if (originated < charteredTurn) return false;
  return nextCharteredTurn === undefined || originated < nextCharteredTurn;
}

/**
 * One read per collection for the whole dead-bank cohort. The borrower read
 * answers the same question the per-loan one did (the balance in the loan's
 * currency and the name) for every borrower at once, from the personal balance
 * map rather than a single projected currency; the caller keeps the running
 * balance between a borrower's loans, exactly as the serial reads saw it after
 * each settled debit. A document missing from the preload falls back to the
 * per-loan read, so a mocked or partial collection cannot invent a state.
 */
async function loadDeadBankLoanPrefetch(
  db: Db,
  loans: readonly BankLoan[]
): Promise<DeadBankLoanPrefetchState> {
  const characterIds = new Map<string, ObjectId>();
  const corporationIds = new Map<string, ObjectId>();
  const npcCurrencies = new Set<CurrencyCode>();
  for (const loan of loans) {
    if (loan.borrowerType === "npcBulk") {
      npcCurrencies.add(loan.currency);
      continue;
    }
    if (!loan.borrowerId) continue;
    if (loan.borrowerType === "character")
      characterIds.set(String(loan.borrowerId), loan.borrowerId);
    else corporationIds.set(String(loan.borrowerId), loan.borrowerId);
  }

  const [characters, corporations, centralBanks] = await Promise.all([
    characterIds.size > 0
      ? db
          .collection<Character>("characters")
          .find(
            { _id: { $in: [...characterIds.values()] } },
            { projection: { name: 1, "currencyBalances.personal": 1 } }
          )
          .toArray()
      : Promise.resolve([]),
    corporationIds.size > 0
      ? db
          .collection<Corporation>("corporations")
          .find(
            { _id: { $in: [...corporationIds.values()] } },
            { projection: { name: 1, liquidCapital: 1 } }
          )
          .toArray()
      : Promise.resolve([]),
    npcCurrencies.size > 0
      ? db
          .collection<{ _id: string; externalBroadMoney?: number }>("centralBanks")
          .find(
            {
              _id: {
                $in: [
                  ...new Set(
                    [...npcCurrencies].map((currency) =>
                      getBankId(getCountryIdForCurrency(currency))
                    )
                  ),
                ],
              },
            },
            { projection: { externalBroadMoney: 1 } }
          )
          .toArray()
      : Promise.resolve([]),
  ]);

  const characterById = new Map(characters.map((row) => [String(row._id), row]));
  const corporationById = new Map(corporations.map((row) => [String(row._id), row]));
  const borrowerState = new Map<string, { available: number; name: string }>();
  for (const loan of loans) {
    if (loan.borrowerType === "npcBulk" || !loan.borrowerId) continue;
    const key = borrowerKeyOf(loan);
    if (borrowerState.has(key)) continue;
    if (loan.borrowerType === "character") {
      const character = characterById.get(String(loan.borrowerId));
      if (!character) continue;
      borrowerState.set(key, {
        available: Math.max(0, character.currencyBalances?.personal?.[loan.currency] ?? 0),
        name: character.name ?? "Borrower",
      });
    } else {
      const corporation = corporationById.get(String(loan.borrowerId));
      if (!corporation) continue;
      borrowerState.set(key, {
        available: Math.max(0, corporation.liquidCapital ?? 0),
        name: corporation.name ?? "Borrower",
      });
    }
  }

  const householdPoolByCurrency = new Map<CurrencyCode, number>();
  for (const row of centralBanks) {
    const currency = [...npcCurrencies].find(
      (code) => getBankId(getCountryIdForCurrency(code)) === row._id
    );
    if (currency) householdPoolByCurrency.set(currency, Math.max(0, row.externalBroadMoney ?? 0));
  }

  return { borrowerState, householdPoolByCurrency };
}

/** The prefetch a loan is serviced with, or undefined when it has none. */
function prefetchForLoan(
  state: DeadBankLoanPrefetchState,
  loan: BankLoan
): DeadBankLoanPrefetch | undefined {
  if (loan.borrowerType === "npcBulk") {
    const householdPool = state.householdPoolByCurrency.get(loan.currency);
    return householdPool === undefined ? undefined : { householdPool };
  }
  const borrower = state.borrowerState.get(borrowerKeyOf(loan));
  return borrower ? { borrower } : undefined;
}

/**
 * Service every loan still owed to a wound-up bank.
 *
 * `serviceLoan` is injected rather than imported so this module does not depend
 * on the turn file that depends on it, and so the servicing arithmetic stays in
 * exactly one place. It serves the loans a bank-level batch cannot express:
 * household-pool tranches (whose cash comes from the central bank, not a named
 * borrower) and collateralised construction loans (which own a lease and loan
 * lock per receipt). Every other loan in the book goes through one journaled
 * move per bank epoch.
 */
export async function processDeadBankLoans(
  db: Db,
  turn: number,
  serviceLoan: (
    loan: BankLoan,
    bank: DeadBank,
    creditTarget: MoneyTarget,
    trackInsuranceRecovery: boolean,
    txEntries: TxInput[],
    prefetch?: DeadBankLoanPrefetch
  ) => Promise<DeadBankLoanServiceResult>
): Promise<DeadBankLoanSummary> {
  const summary: DeadBankLoanSummary = { ...ZERO_DEAD_BANK_SUMMARY };
  const deadBanks = await findDeadBanksWithLoans(db);
  if (deadBanks.length === 0) return summary;

  // One loan read for every dead book, then grouped per bank in collection
  // order, instead of one query per bank. Each bank still services its own
  // loans in the same order.
  const allLoans: BankLoan[] = await db
    .collection<BankLoan>("bankLoans")
    .find({
      bankCorporationId: { $in: deadBanks.map((bank) => bank.corporationId) },
      status: { $in: ["current", "arrears"] },
      lastProcessedTurn: { $ne: turn },
    })
    .toArray();
  const loansByBankKey = new Map<string, BankLoan[]>();
  for (const loan of allLoans) {
    const key = String(loan.bankCorporationId);
    const group = loansByBankKey.get(key);
    if (group) group.push(loan);
    else loansByBankKey.set(key, [loan]);
  }
  const prefetchState = await loadDeadBankLoanPrefetch(db, allLoans);
  const multiCurrency = multiCurrencyCorporations(allLoans);
  // One fund document per currency: several wound-up charters can share one,
  // and the upsert is idempotent, so the estate read is per currency.
  const fundsByCurrency = new Map<CurrencyCode, Awaited<ReturnType<typeof ensureFund>>>();
  // The thresholds document is one row for the whole turn; read it once rather
  // than once per bank that emitted rows.
  let txThresholds: Awaited<ReturnType<typeof loadTxThresholds>> | undefined;
  const thresholds = async () => {
    txThresholds ??= await loadTxThresholds(db);
    return txThresholds;
  };

  for (const bank of deadBanks) {
    const loans = (loansByBankKey.get(String(bank.corporationId)) ?? []).filter((loan) =>
      loanInEpoch(loan, bank.charteredTurn, bank.nextCharteredTurn)
    );
    if (loans.length === 0) continue;

    const target = recoveryTargetFor(bank);
    let trackInsuranceRecovery = false;
    if (bank.resolved || bank.historyId) {
      // The fund document has to exist before anything is paid into it: a
      // recovery credited to a missing fund is money that silently stops
      // existing, which is the whole class of bug this work is about.
      let fund = fundsByCurrency.get(bank.currency);
      if (!fund) {
        fund = await ensureFund(db, bank.currency);
        fundsByCurrency.set(bank.currency, fund);
      }
      trackInsuranceRecovery =
        typeof bank.measuredClaimTurn === "number" &&
        typeof fund.pricingEvidenceStartTurn === "number" &&
        bank.measuredClaimTurn >= fund.pricingEvidenceStartTurn;
    }

    // Repayment ledger rows are queued and flushed once per bank so each row
    // does not reload the tx thresholds and the anchor-rate map.
    const txEntries: TxInput[] = [];

    // A borrower's loans are batched together or serviced per loan together:
    // either way, each loan of theirs sees what the previous one left, which is
    // the order of precedence the serial pass had. A borrower whose book holds
    // a loan the batch cannot express keeps every loan on the per-loan path.
    const byBorrower = new Map<string, BankLoan[]>();
    for (const loan of loans) {
      const key = borrowerKeyOf(loan);
      const group = byBorrower.get(key);
      if (group) group.push(loan);
      else byBorrower.set(key, [loan]);
    }
    const batchGroups: BankLoan[][] = [];
    const perLoan: BankLoan[] = [];
    for (const group of byBorrower.values()) {
      if (group.every((loan) => batchCanService(loan, prefetchState, multiCurrency)))
        batchGroups.push(group);
      else perLoan.push(...group);
    }

    // One journaled move per bank epoch: N borrower debits, one summed credit,
    // one loan projection per loan. The decisions are taken against the same
    // prefetched running balance the per-loan path used.
    const batchRows: LoanServiceBatchRow[] = [];
    for (const group of batchGroups) {
      for (const loan of group) {
        const key = borrowerKeyOf(loan);
        const preloaded = prefetchState.borrowerState.get(key)!;
        const { decision, transition } = loanServiceTransition({
          loan,
          borrowerAvailable: preloaded.available,
          turn,
          creditTarget: target,
          bankId: bank.corporationId.toString(),
          trackInsuranceRecovery,
        });
        preloaded.available = Math.max(0, preloaded.available - decision.payment);
        batchRows.push({ loan, decision, transition, borrowerKey: key });
      }
    }
    if (batchRows.length > 0) {
      const batchKey = deadBankLoanServiceKey(bank, turn);
      const settled = await settleTransition(db, {
        ...batchedLoanServiceMove(batchRows, target, {
          totalLoansFilter: {
            _id: bank.corporationId,
            // Legacy loans are matched by origination turn; the live path omits
            // the epoch guard for them, so the batch does too.
            ...(batchRows.every((row) => row.loan.charteredTurn !== undefined)
              ? { "bankCharter.charteredTurn": bank.charteredTurn }
              : {}),
          },
          ...(trackInsuranceRecovery && target.collection === "depositInsuranceFunds"
            ? { measuredRecoveryFilter: target.filter }
            : {}),
        }),
        key: batchKey,
        kind: "loan_service_batch",
        turn,
        currency: bank.currency,
        batchIndependentDebits: true,
        event: {
          kind: "monetary.executed",
          command: "turn.loanService.deadBankBatch",
          subjectType: "corporation",
          subjectId: bank.corporationId.toString(),
          amount: batchRows.reduce((sum, row) => sum + Math.max(0, row.decision.payment), 0),
          meta: { loans: batchRows.length, charteredTurn: bank.charteredTurn },
        },
      });
      if (settled.status === "applied") {
        const recorded = recordLoanServiceBatch({
          db,
          rows: batchRows,
          turn,
          currency: bank.currency,
          bankName: bank.name,
          settlementId: batchKey,
          borrowerName: (row) =>
            prefetchState.borrowerState.get(row.borrowerKey)?.name ?? "Borrower",
        });
        summary.loansServiced += batchRows.length;
        summary.interestCollected += recorded.totals.interestCollected;
        summary.principalRepaid += recorded.totals.principalRepaid;
        summary.defaultsWrittenOff += recorded.totals.writtenOff;
        if (bank.resolved) summary.recoveredToInsurer += recorded.totals.bankCredit;
        else summary.recoveredToEstate += recorded.totals.bankCredit;
        txEntries.push(...recorded.txEntries);
      } else if (settled.status === "partial") {
        // Money is half delivered and the journal owns the repair, exactly as a
        // per-loan partial did. Nothing further is charged this pass, and the
        // prefetched balances are dropped so any later book reads the truth.
        summary.loansServiced += batchRows.length;
        for (const row of batchRows) prefetchState.borrowerState.delete(row.borrowerKey);
      } else if (settled.status === "rejected") {
        // A refused batch moved nothing: every loan retries on its own key.
        // Dropping the prefetched balance makes the per-loan path read the
        // truth instead of a balance the refused decisions already spent.
        for (const row of batchRows) prefetchState.borrowerState.delete(row.borrowerKey);
        for (const row of batchRows) perLoan.push(row.loan);
      } else {
        // replayed: the batch key already owns this epoch's servicing, and the
        // journal is the only writer that may finish it. Whether its debit has
        // landed is not knowable here, so a later book reads the balance.
        summary.loansServiced += batchRows.length;
        for (const row of batchRows) prefetchState.borrowerState.delete(row.borrowerKey);
      }
    }

    for (const loan of perLoan) {
      const prefetch = prefetchForLoan(prefetchState, loan);
      const result = await serviceLoan(
        loan,
        bank,
        target,
        trackInsuranceRecovery,
        txEntries,
        prefetch
      );
      summary.loansServiced += 1;
      summary.interestCollected += result.interestCollected;
      summary.principalRepaid += result.principalRepaid;
      summary.defaultsWrittenOff += result.writtenOff;
      if (bank.resolved) summary.recoveredToInsurer += result.collected;
      else summary.recoveredToEstate += result.collected;
      if (prefetch?.borrower) {
        // A replay or a partial move may have changed the balance behind this
        // snapshot; drop it so the next loan on the borrower reads the truth.
        if (result.replayed || result.partial)
          prefetchState.borrowerState.delete(borrowerKeyOf(loan));
        else if ((result.paidLocal ?? 0) > 0)
          prefetch.borrower.available = Math.max(
            0,
            prefetch.borrower.available - result.paidLocal!
          );
      }
      if (prefetch?.householdPool !== undefined) {
        if (result.replayed || result.partial)
          prefetchState.householdPoolByCurrency.delete(loan.currency);
        else prefetch.householdPool = Math.max(0, prefetch.householdPool - result.collected);
      }
    }
    if (txEntries.length > 0) await emitTxBulk(db, txEntries, await thresholds());
  }

  return summary;
}

/**
 * Corporations whose dead-bank loans span more than one currency. A
 * corporation's treasury is one pot, but the prefetch models it once per loan
 * currency, so summing such a borrower's debits would spend the same cash
 * twice. Every one of its loans stays on the per-loan path, whose debit guard
 * refuses the second currency exactly as it does today.
 */
function multiCurrencyCorporations(loans: readonly BankLoan[]): ReadonlySet<string> {
  const currencies = new Map<string, Set<CurrencyCode>>();
  for (const loan of loans) {
    if (loan.borrowerType !== "corporation" || !loan.borrowerId) continue;
    const key = String(loan.borrowerId);
    const held = currencies.get(key) ?? new Set<CurrencyCode>();
    held.add(loan.currency);
    currencies.set(key, held);
  }
  return new Set([...currencies].filter(([, held]) => held.size > 1).map(([id]) => id));
}

/**
 * A loan the bank-level move can carry on its own: a named borrower whose
 * balance was preloaded, and no construction receipt of its own to lease.
 *
 * Everything else keeps the per-loan path: household-pool tranches (no named
 * borrower, cash from the central bank), collateralised construction loans
 * (their own lease and loan lock), a loan whose borrower has no document to
 * read, and a corporation whose dead-bank book spans currencies.
 */
function batchCanService(
  loan: BankLoan,
  state: DeadBankLoanPrefetchState,
  multiCurrency: ReadonlySet<string>
): boolean {
  if (loan.borrowerType !== "character" && loan.borrowerType !== "corporation") return false;
  if (!loan.borrowerId || loan.constructionCollateral) return false;
  if (loan.borrowerType === "corporation" && multiCurrency.has(String(loan.borrowerId)))
    return false;
  return state.borrowerState.has(borrowerKeyOf(loan));
}

/** Deterministic key per bank, turn and charter epoch, so a retry replays rather than repeats. */
function deadBankLoanServiceKey(bank: DeadBank, turn: number): string {
  return `dead-bank-loan-service-batch:${bank.corporationId.toString()}:${bank.charteredTurn}:${turn}`;
}
