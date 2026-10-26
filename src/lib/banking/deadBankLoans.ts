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
 * Both destinations go through the same money primitive under the same per-loan
 * key as a normal servicing pass, so a retried turn cannot charge a borrower
 * twice.
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
import { emitTxBulk, loadTxThresholds, type TxInput } from "@/lib/financialTxLog/emit";

export type DeadBankLoanSummary = {
  /** Loans belonging to a wound-up bank that were serviced this turn. */
  loansServiced: number;
  /** Cash recovered into a bank still awaiting resolution. */
  recoveredToEstate: number;
  /** Cash recovered into the insurance fund after resolution closed. */
  recoveredToInsurer: number;
};

export const ZERO_DEAD_BANK_SUMMARY: DeadBankLoanSummary = {
  loansServiced: 0,
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
 * exactly one place.
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
  // loans serially and in the same order.
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

    // Serial per bank: two loans from the same borrower must see each other's
    // debit, exactly as the live path does. Repayment ledger rows are queued
    // and flushed once per bank so each row does not reload the tx thresholds
    // and the anchor-rate map.
    const txEntries: TxInput[] = [];
    for (const loan of loans) {
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
