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
 * A whole epoch's book is serviced in at most two journaled moves. The named
 * loans and the household tranches share one: the decisions are still taken
 * loan by loan against a running borrower balance and a running household pool,
 * the borrower debits are summed per borrower, the pool debits one per
 * currency, the credit is summed once and the loan records ride the same
 * receipt. The construction loans take a second move, because they hold a
 * lease and a loan lock that the per-loan path used to take once per loan. The
 * per-loan path remains for the loans neither move can carry: an untagged
 * legacy loan whose lease cannot name the epoch, a borrower with no document,
 * a corporation whose book spans currencies, and anything another receipt
 * still owns.
 */

import type { Db, ObjectId } from "mongodb";
import { lifecycleStage, stageAllows } from "@/lib/banking/rules/lifecycle";
import type { Character, Corporation } from "@/lib/db/types";
import type { BankCharterHistoryEntry, BankLoan } from "@/lib/db/types/bank";
import type { CurrencyCode } from "@/lib/constants/currencies";
import { getCountryIdForCurrency } from "@/lib/constants/currencies";
import { getBankId } from "@/lib/centralBank/helpers";
import type { MoneyTarget } from "@/lib/banking/moneyMove";
import { MONEY_MOVE_COLLECTION } from "@/lib/banking/moneyMove";
import { ensureFund } from "@/lib/banking/insurance";
import { loanCharterEpoch } from "@/lib/banking/loanEpoch";
import { getCreditBand } from "@/lib/banking/rules/creditBands";
import {
  acquireConstructionServiceLease,
  releaseConstructionServiceLease,
} from "@/lib/banking/constructionServiceLease";
import { loanServiceTransition, type LoanServiceDecision } from "@/lib/banking/rules/loanServicing";
import { npcBulkInstalment } from "@/lib/banking/rules/loans";
import { settleTransition, resumeSettlement } from "@/lib/banking/settlementJournal";
import {
  batchedLoanServiceMove,
  recordLoanServiceBatch,
  type LoanServiceBatchRow,
  type LoanServiceBatchTotals,
} from "@/lib/banking/loanServiceBatch";
import type { TransitionLeg, TransitionProjection } from "@/lib/banking/rules/boundary";
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
    // An unresolved estate is the dead bank's own cash, so its construction
    // instalments still hold the bank epoch, exactly as the per-loan path did.
    const holdsBankEpoch =
      target.collection === "corporations" && target.path === "bankCharter.cashReserves";
    const batchGroups: BankLoan[][] = [];
    const constructionGroups: BankLoan[][] = [];
    const npcGroups: BankLoan[][] = [];
    const perLoan: BankLoan[] = [];
    for (const group of byBorrower.values()) {
      if (group[0].borrowerType === "npcBulk") {
        npcGroups.push(group);
        continue;
      }
      if (!group.every((loan) => batchCanService(loan, prefetchState, multiCurrency))) {
        perLoan.push(...group);
        continue;
      }
      if (!group.some((loan) => loan.constructionCollateral)) {
        batchGroups.push(group);
        continue;
      }
      // A construction instalment leases the lender's epoch as well as the
      // loan, and only a loan tagged with this epoch can name that lease. An
      // untagged legacy loan keeps the per-loan path, which skipped it for the
      // same reason when its lease could not name it.
      const leaseable = group.every(
        (loan) =>
          !loan.constructionCollateral ||
          !holdsBankEpoch ||
          loan.charteredTurn === bank.charteredTurn
      );
      if (leaseable) constructionGroups.push(group);
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

    // Household tranches of one currency fold into the same move as one pooled
    // debit: the decisions are taken tranche by tranche against the running
    // pool, in book order, so each one spends what the previous one left. The
    // pooled guard is the whole debit, so a pool another writer drained refuses
    // the move before it moves anything and every tranche retries on its own.
    const pooledDebits: TransitionLeg[] = [];
    const npcCurrencies: CurrencyCode[] = [];
    for (const group of npcGroups) {
      const currency = group[0].currency;
      const pool = prefetchState.householdPoolByCurrency.get(currency);
      if (pool === undefined) {
        perLoan.push(...group);
        continue;
      }
      npcCurrencies.push(currency);
      let running = pool;
      let pooled = 0;
      for (const loan of group) {
        const row = deadNpcBulkRow({
          loan,
          target,
          trackInsuranceRecovery,
          turn,
          householdPool: running,
        });
        running = Math.max(0, running - row.decision.payment);
        pooled += Math.max(0, row.decision.payment);
        batchRows.push(row);
      }
      prefetchState.householdPoolByCurrency.set(currency, running);
      if (pooled > 0) {
        pooledDebits.push({
          kind: "debit",
          amount: pooled,
          collection: "centralBanks",
          filter: {
            _id: getBankId(getCountryIdForCurrency(currency)),
            externalBroadMoney: { $gte: pooled },
          },
          path: "externalBroadMoney",
          note: "NPC household repayments leave the central bank household pool",
        });
      }
    }

    if (batchRows.length > 0) {
      const batchKey = deadBankLoanServiceKey(bank, turn);
      // Only named loans fold a cached loan total; a household tranche never
      // moved the bank's book, so its epoch must not decide that guard.
      const bookRows = batchRows.filter((row) => row.loan.borrowerType !== "npcBulk");
      const settled = await settleTransition(db, {
        ...batchedLoanServiceMove(
          batchRows,
          target,
          {
            totalLoansFilter: {
              _id: bank.corporationId,
              // Legacy loans are matched by origination turn; the live path omits
              // the epoch guard for them, so the batch does too.
              ...(bookRows.every((row) => row.loan.charteredTurn !== undefined)
                ? { "bankCharter.charteredTurn": bank.charteredTurn }
                : {}),
            },
            ...(trackInsuranceRecovery && target.collection === "depositInsuranceFunds"
              ? { measuredRecoveryFilter: target.filter }
              : {}),
          },
          pooledDebits
        ),
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
      const forgetPool = () => {
        for (const currency of npcCurrencies)
          prefetchState.householdPoolByCurrency.delete(currency);
      };
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
        forgetPool();
      } else if (settled.status === "rejected") {
        // A refused batch moved nothing: every loan retries on its own key.
        // Dropping the prefetched balance makes the per-loan path read the
        // truth instead of a balance the refused decisions already spent.
        for (const row of batchRows) prefetchState.borrowerState.delete(row.borrowerKey);
        for (const row of batchRows) perLoan.push(row.loan);
        forgetPool();
      } else {
        // replayed: the batch key already owns this epoch's servicing, and the
        // journal is the only writer that may finish it. Whether its debit has
        // landed is not knowable here, so a later book reads the balance.
        summary.loansServiced += batchRows.length;
        for (const row of batchRows) prefetchState.borrowerState.delete(row.borrowerKey);
        forgetPool();
      }
    }

    // The construction slice keeps the lease and the per-loan lock, because
    // cancellation, funding, sale and settlement run outside the turn process
    // and coordinate only through them; it takes both once for the whole bank
    // instead of once per loan.
    if (constructionGroups.length > 0) {
      const outcome = await serviceConstructionBatch(
        { db, turn, bank, target, holdsBankEpoch, trackInsuranceRecovery, prefetch: prefetchState },
        constructionGroups
      );
      perLoan.push(...outcome.left);
      summary.loansServiced += outcome.loansServiced;
      if (outcome.totals) {
        summary.interestCollected += outcome.totals.interestCollected;
        summary.principalRepaid += outcome.totals.principalRepaid;
        summary.defaultsWrittenOff += outcome.totals.writtenOff;
        if (bank.resolved) summary.recoveredToInsurer += outcome.totals.bankCredit;
        else summary.recoveredToEstate += outcome.totals.bankCredit;
      }
      txEntries.push(...outcome.txEntries);
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
 * balance was preloaded.
 *
 * Everything else keeps the per-loan path: a loan whose borrower has no
 * document to read, and a corporation whose dead-bank book spans currencies.
 * Household tranches and collateralised construction loans are routed to their
 * own moves before this is asked.
 */
function batchCanService(
  loan: BankLoan,
  state: DeadBankLoanPrefetchState,
  multiCurrency: ReadonlySet<string>
): boolean {
  if (loan.borrowerType !== "character" && loan.borrowerType !== "corporation") return false;
  if (!loan.borrowerId) return false;
  if (loan.borrowerType === "corporation" && multiCurrency.has(String(loan.borrowerId)))
    return false;
  return state.borrowerState.has(borrowerKeyOf(loan));
}

/** Deterministic key per bank, turn and charter epoch, so a retry replays rather than repeats. */
function deadBankLoanServiceKey(bank: DeadBank, turn: number): string {
  return `dead-bank-loan-service-batch:${bank.corporationId.toString()}:${bank.charteredTurn}:${turn}`;
}

/** Deterministic key for the construction slice of the same bank epoch. */
function deadBankConstructionServiceKey(bank: DeadBank, turn: number): string {
  return `${DEAD_BANK_CONSTRUCTION_BATCH_PREFIX}${bank.corporationId.toString()}:${bank.charteredTurn}:${turn}`;
}

/**
 * Owner stamped on every loan a dead bank's construction batch takes.
 *
 * The batch settles under one journal key, so a lock it leaves behind is not
 * one the per-loan recovery can finish by loan id. The next pass recognises its
 * own prefix and frees the loan itself.
 */
const DEAD_BANK_CONSTRUCTION_BATCH_PREFIX = "dead-bank-construction-service-batch:";

/**
 * One household tranche as a row of the bank-level move.
 *
 * The cash comes from the central bank's household pool rather than a
 * borrower, so the row carries no legs: the caller sums the currency's
 * tranches into one guarded pool debit. The decision is the same one the
 * per-loan path takes, against the pool as the previous tranche left it.
 */
function deadNpcBulkRow(args: {
  loan: BankLoan;
  target: MoneyTarget;
  trackInsuranceRecovery: boolean;
  turn: number;
  householdPool: number;
}): LoanServiceBatchRow {
  const { loan, turn } = args;
  const instalment = npcBulkInstalment({
    outstanding: loan.outstanding ?? 0,
    ratePercent: loan.ratePercent ?? 0,
    defaultRatePercent: getCreditBand(loan.creditBand).defaultRatePercent,
    currency: loan.currency,
    householdPool: args.householdPool,
  });
  const status: BankLoan["status"] = instalment.outstanding <= 0 ? "repaid" : "current";
  const decision: LoanServiceDecision = {
    outcome: instalment.writtenOff > 0 ? "defaulted" : status === "repaid" ? "closed" : "paid",
    payment: instalment.collected,
    interestPaid: instalment.interest,
    principalPaid: instalment.principal,
    nextOutstanding: instalment.outstanding,
    writtenOff: instalment.writtenOff,
    status,
    arrearsTurns: loan.arrearsTurns ?? 0,
    bankCredit: instalment.collected,
    totalLoansDelta: 0,
  };
  const projections: TransitionProjection[] = [
    {
      collection: "bankLoans",
      filter: { _id: loan._id, lastProcessedTurn: { $ne: turn } },
      update: {
        $set: {
          outstanding: instalment.outstanding,
          principal: Math.max(loan.principal ?? 0, instalment.outstanding),
          status,
          lastProcessedTurn: turn,
        },
      },
      note: "the resolved charter's household tranche follows its repayment",
    },
  ];
  if (args.trackInsuranceRecovery && args.target.collection === "depositInsuranceFunds") {
    projections.push({
      collection: "depositInsuranceFunds",
      filter: args.target.filter,
      update: { $inc: { measuredRecoveriesSincePricingStart: instalment.collected } },
      note: "Record borrower cash recovered for a measured resolved insurance claim",
    });
  }
  return {
    loan,
    decision,
    borrowerKey: borrowerKeyOf(loan),
    ledger: false,
    transition: {
      key: `npc-loan-service:${loan._id.toString()}:${turn}`,
      kind: "npc_loan_service",
      turn,
      currency: loan.currency,
      legs: [],
      projections,
      event: {
        kind: "loan.paid",
        command: "bank.household.service",
        amount: instalment.collected,
        meta: { borrowerType: "npcBulk", charteredTurn: loanCharterEpoch(loan) },
      },
    },
  };
}

type ConstructionBatchContext = {
  db: Db;
  turn: number;
  bank: DeadBank;
  target: MoneyTarget;
  /** The instalment has to hold the dead bank's own epoch, as the per-loan path did. */
  holdsBankEpoch: boolean;
  trackInsuranceRecovery: boolean;
  prefetch: DeadBankLoanPrefetchState;
};

type ConstructionBatchOutcome = {
  totals?: LoanServiceBatchTotals;
  txEntries: TxInput[];
  loansServiced: number;
  /** Loans the batch did not take, for the per-loan path. */
  left: BankLoan[];
};

/**
 * A dead bank's construction book in one journaled move.
 *
 * The lease and the loan lock stay. `constructionFinance`, `constructionSale`,
 * `constructionCancellation` and `constructionSettlement` run from request
 * handlers beside the turn and coordinate with it only through
 * `bankConstructionFunding` and `constructionSettlementOwner`; the turn's
 * banking lanes are in-memory keys that those writers never take. Dropping
 * either would let a cancellation or a sale settle the same pledge while the
 * instalment charges it. What changes is that both are taken once for the whole
 * bank epoch rather than once per loan, and the money and loan records land as
 * one receipt. The pledge reads themselves were always projections, so nothing
 * per loan remains to prefetch. A loan another receipt still owns keeps the
 * per-loan path, which knows how to recover it.
 */
async function serviceConstructionBatch(
  context: ConstructionBatchContext,
  groups: readonly BankLoan[][]
): Promise<ConstructionBatchOutcome> {
  const { db, turn, bank, target, holdsBankEpoch, trackInsuranceRecovery, prefetch } = context;
  const loans = groups.flat();
  const key = deadBankConstructionServiceKey(bank, turn);
  const loanIds = loans.map((loan) => loan._id);
  const anchor = loans.find((loan) => loan.constructionCollateral);
  const bankLoans = db.collection<BankLoan>("bankLoans");
  const constructionTarget: MoneyTarget = holdsBankEpoch
    ? {
        ...target,
        filter: {
          ...target.filter,
          "bankCharter.charteredTurn": bank.charteredTurn,
          "bankConstructionFunding.kind": "servicing",
          "bankConstructionFunding.service.key": key,
        },
      }
    : target;

  // A crashed earlier pass may have left its locks with no journal, which no
  // recovery worker looks for once its lease is gone. Free them first.
  await clearStaleConstructionBatchLocks(db, key, loans);

  const leased = holdsBankEpoch
    ? !!anchor &&
      (await acquireConstructionServiceLease(
        db,
        anchor,
        key,
        turn,
        "servicing",
        loanIds.map((id) => String(id))
      ))
    : false;
  // The bank is busy with another funding move this turn, which would have
  // refused every per-loan lease too.
  if (holdsBankEpoch && !leased) return { txEntries: [], loansServiced: 0, left: [...loans] };

  const release = async () => {
    if (holdsBankEpoch && anchor) {
      await releaseConstructionServiceLease(
        db,
        bank.corporationId,
        anchor._id,
        key,
        "servicing",
        loanIds
      );
      return;
    }
    await bankLoans.updateMany(
      { _id: { $in: loanIds }, constructionSettlementOwner: key },
      { $unset: { constructionSettlementOwner: "" } }
    );
  };

  await bankLoans.updateMany(
    {
      _id: { $in: loanIds },
      $or: [
        { constructionSettlementOwner: { $exists: false } },
        { constructionSettlementOwner: key },
      ],
    },
    { $set: { constructionSettlementOwner: key } }
  );
  const ownedRows = await bankLoans
    .find({ _id: { $in: loanIds }, constructionSettlementOwner: key })
    .toArray();
  const ownedById = new Map(ownedRows.map((loan) => [String(loan._id), loan]));
  // The original book order, not the store's: payments draw each borrower's
  // running balance down in the order the serial path used.
  const owned = loans.flatMap((loan) => ownedById.get(String(loan._id)) ?? []);
  const foreign = loans.filter((loan) => !ownedById.has(String(loan._id)));
  const serviceable = (loan: BankLoan) =>
    ["current", "arrears"].includes(loan.status) &&
    loan.lastProcessedTurn !== turn &&
    !!loan.borrowerId &&
    prefetch.borrowerState.has(borrowerKeyOf(loan));
  const due = owned.filter(serviceable);
  const dueIds = new Set(due.map((loan) => String(loan._id)));
  const idle = owned.filter((loan) => !dueIds.has(String(loan._id)));
  if (idle.length > 0) {
    await bankLoans.updateMany(
      { _id: { $in: idle.map((loan) => loan._id) }, constructionSettlementOwner: key },
      { $unset: { constructionSettlementOwner: "" } }
    );
  }
  const left = [...foreign, ...idle];
  if (due.length === 0) {
    await release();
    return { txEntries: [], loansServiced: 0, left };
  }

  const rows: LoanServiceBatchRow[] = [];
  for (const loan of due) {
    const borrowerKey = borrowerKeyOf(loan);
    const preloaded = prefetch.borrowerState.get(borrowerKey)!;
    const { decision, transition } = loanServiceTransition({
      loan,
      borrowerAvailable: preloaded.available,
      turn,
      creditTarget: constructionTarget,
      bankId: bank.corporationId.toString(),
      trackInsuranceRecovery,
    });
    preloaded.available = Math.max(0, preloaded.available - decision.payment);
    rows.push({ loan, decision, transition, borrowerKey });
  }

  const settled = await settleTransition(db, {
    ...batchedLoanServiceMove(rows, constructionTarget, {
      totalLoansFilter: constructionTarget.filter,
      ...(trackInsuranceRecovery && constructionTarget.collection === "depositInsuranceFunds"
        ? { measuredRecoveryFilter: constructionTarget.filter }
        : {}),
    }),
    key,
    kind: "loan_service_construction_batch",
    turn,
    currency: bank.currency,
    batchIndependentDebits: true,
    event: {
      kind: "monetary.executed",
      command: "turn.loanService.deadBankConstructionBatch",
      subjectType: "corporation",
      subjectId: bank.corporationId.toString(),
      amount: rows.reduce((sum, row) => sum + Math.max(0, row.decision.payment), 0),
      meta: { loans: rows.length, charteredTurn: bank.charteredTurn },
    },
  });

  const forgetBorrowers = () => {
    for (const row of rows) prefetch.borrowerState.delete(row.borrowerKey);
  };
  // Released exactly as the per-loan path released its lease: on a clean
  // landing, or on a refusal that moved nothing. A partial keeps them for the
  // journal, which is what recovery finishes.
  const landed = !settled.error && (settled.status === "applied" || settled.status === "replayed");
  const refused =
    settled.status === "rejected" &&
    settled.appliedLegs.length === 0 &&
    settled.appliedProjections.length === 0;
  if (landed) {
    // The ledger row names the borrower, so it is written before the prefetched
    // names and balances are dropped.
    const recorded =
      settled.status === "applied"
        ? recordLoanServiceBatch({
            db,
            rows,
            turn,
            currency: bank.currency,
            bankName: bank.name,
            settlementId: key,
            borrowerName: (row) => prefetch.borrowerState.get(row.borrowerKey)?.name ?? "Borrower",
          })
        : undefined;
    await release();
    forgetBorrowers();
    return {
      ...(recorded ? { totals: recorded.totals } : {}),
      txEntries: recorded?.txEntries ?? [],
      loansServiced: rows.length,
      left,
    };
  }
  if (refused) {
    await release();
    forgetBorrowers();
    return {
      txEntries: [],
      loansServiced: 0,
      left: [...left, ...rows.map((row) => row.loan)],
    };
  }
  // Partial: the lease and the loan locks stay with the journal, and the next
  // turn's recovery resumes it before anything else touches them.
  forgetBorrowers();
  return { txEntries: [], loansServiced: rows.length, left };
}

/**
 * Free the locks a crashed earlier construction batch left on these loans.
 *
 * A batch writes its locks before it claims its journal, so an owner with no
 * record is a pass that never moved money, and one with a record is finished
 * (or refused) before the lock is freed. A partial record keeps its locks: the
 * journal owns that repair.
 */
async function clearStaleConstructionBatchLocks(
  db: Db,
  key: string,
  loans: readonly BankLoan[]
): Promise<void> {
  const stale = [
    ...new Set(
      loans.flatMap((loan) => {
        const owner = loan.constructionSettlementOwner;
        return typeof owner === "string" &&
          owner.startsWith(DEAD_BANK_CONSTRUCTION_BATCH_PREFIX) &&
          owner !== key
          ? [owner]
          : [];
      })
    ),
  ];
  if (stale.length === 0) return;
  const records = await db
    .collection<{ _id: string }>(MONEY_MOVE_COLLECTION)
    .find({ _id: { $in: stale } }, { projection: { _id: 1 } })
    .toArray();
  const claimed = new Set(records.map((record) => record._id));
  const cleared: string[] = [];
  for (const owner of stale) {
    if (!claimed.has(owner)) {
      cleared.push(owner);
      continue;
    }
    const resumed = await resumeSettlement(db, owner);
    const complete = !resumed.error && ["applied", "replayed"].includes(resumed.status);
    const unfunded =
      resumed.status === "rejected" &&
      resumed.appliedLegs.length === 0 &&
      resumed.appliedProjections.length === 0;
    if (complete || unfunded) cleared.push(owner);
  }
  if (cleared.length === 0) return;
  await db
    .collection<BankLoan>("bankLoans")
    .updateMany(
      { constructionSettlementOwner: { $in: cleared } },
      { $unset: { constructionSettlementOwner: "" } }
    );
}
