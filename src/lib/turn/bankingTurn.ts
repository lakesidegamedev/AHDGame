import { publishBankLoanInterestHistory } from "@/lib/banking/publishLoanInterest";
import * as Sentry from "@sentry/nextjs";
import type { DepositTaker, BankPassCaches } from "@/lib/banking/processBank";
import { processOneBank } from "@/lib/banking/processBank";
import { BANK_CHARTER_ONLY, BROAD_MONEY_ONLY } from "@/lib/banking/npcBulkLoanService";
import { bankPassLockKeys } from "./bankingPassLocks";

import { substepMarker } from "@/lib/observability/phaseSubsteps";
import { KeyedQueue, interleaveByKey, runInLanes } from "@/lib/turn/settlementLanes";

import { resumeTreasuryReserveTransfers } from "@/lib/budget/treasuryReserveTransfer";
/**
 * Private banking each turn. processBankingTurn moves household deposits,
 * pays savings interest and services loans from their payers' available cash.
 * Discount-window interest remains due when proprietary trading is disabled.
 */

import { type Db } from "mongodb";
import { withSettlementReadSnapshot } from "@/lib/banking/settlementReadSnapshot";
import { resumeReservePoolTransfers } from "@/lib/centralBank/reservePoolTransferCommands";
import { resumeMonetaryOperations } from "@/lib/moneySupply/monetaryOperationJournal";
import { resumeLiquidityAdvances } from "@/lib/moneySupply/liquidityAdvance";
import { MONETARY_OPERATION_COOLDOWN_TURNS } from "@/lib/moneySupply/operations";
import type { Corporation, CorporateSector } from "@/lib/db/types";
import type { BankCharter, BankLoan } from "@/lib/db/types/bank";
import type { CentralBank } from "@/lib/db/types/centralBank";
import type { CurrencyCode } from "@/lib/constants/currencies";
import { getCountryIdForCurrency } from "@/lib/constants/currencies";

import { getBankId } from "@/lib/centralBank/helpers";
import { loadBankingPolicy } from "@/lib/banking/policy";
import { processBankTreasuryTurn } from "@/lib/banking/bankTreasury";

import { recoverBankingSettlements } from "@/lib/banking/recovery";

import {
  recordBankingStage,
  timedBankingStage,
  withBankingTelemetryBatch,
} from "@/lib/banking/telemetry";
import { SETTLEMENT_HISTORY_EXCLUDED } from "@/lib/banking/settlementHistory";
import { computeNpcDepositShare } from "@/lib/banking/deposits";
import { domesticDepositRetention } from "@/lib/centralBank/marketEffects";
import {
  bankingTurnPublicationFilter,
  loadInsurancePremiumReceiptsForTurn,
} from "@/lib/banking/insurancePremium";
import { unbookedSovereignAssetIncome } from "@/lib/banking/rules/sovereignClaims";
import { npcBulkInstalment } from "@/lib/banking/rules/loans";

import { settleTransition } from "@/lib/banking/settlementJournal";

import { effectiveBankRatesFromPrime } from "@/lib/banking/rates";

import { savingsApyPercent } from "@/lib/currency/rules/savingsInterest";
import { loadCentralBankPricingAdjustment } from "@/lib/monetaryPolicy/centralBankPricing";
import { loadTxThresholds } from "@/lib/financialTxLog/emit";

import { loadWorldEraUnitScale } from "@/lib/currency/gdpAnchorRate";
import { isNamedLendingCharter } from "@/lib/banking/charterKinds";
import { charterCapabilities, charterMay } from "@/lib/banking/rules/capabilities";

import { processDeadBankLoans } from "@/lib/banking/deadBankLoans";
import {
  serviceNamedLoanBook,
  servicePlayerLoan,
  type LoanServiceResult,
} from "@/lib/banking/namedLoanBook";
import { loanCharterEpoch } from "@/lib/banking/loanEpoch";
import { type MoneyTarget } from "@/lib/banking/moneyMove";
import { getCreditBand } from "@/lib/banking/creditBands";
import { ZERO_BANKING_TURN_SUMMARY, type BankingTurnSummary } from "@/lib/turn/bankingTurnSummary";
import { serviceInterbankAndCbMargin } from "./bankingInterbankTurn";
import { centralBanksCollection } from "@/lib/db/repositories/centralBanks";
import { corporationsCollection } from "@/lib/db/repositories/corporations";

import { corporateSectorsCollection } from "@/lib/db/repositories/corporateSectors";

import { bankMoneyMovesCollection } from "@/lib/db/repositories/bankMoneyMoves";
import type { Document } from "mongodb";

// Re-exported for the turn's tests and dashboards; defined in the rules zone.
export { ARREARS_DEFAULT_TURNS, MAX_NPC_FLOW_PER_TURN_FRACTION } from "@/lib/banking/rules/loans";

export type { BankingTurnSummary } from "@/lib/turn/bankingTurnSummary";

/**
 * Private-bank deposit flows, deposit interest (paid from bank cash), player
 * loan servicing, and NPC bulk book. Runs immediately after savingsInterestTurn.
 *
 * `turn` is the in-flight turn number from the registry (`newTurn`). gameState
 * `currentTurn` is only advanced after all phases finish, so callers must pass
 * the turn explicitly for idempotency keys.
 */
export interface BankingTurnOptions {
  /**
   * By default, one cohort read for the per-bank deposit-ceiling sectors and one
   * thresholds read per turn, instead of one of each per bank. Reads only, and
   * every value is the one the per-bank path would have fetched.
   */
  batchPerBankReads?: boolean;
}

export async function processBankingTurn(
  db: Db,
  turn: number,
  options: BankingTurnOptions = {}
): Promise<BankingTurnSummary> {
  // Every settlement in the pass bumps the turn's banking telemetry document.
  // Unbatched, that was about 150 concurrent increments on one document per
  // turn; batched, one write when the pass ends. Counts are unchanged.
  return withSettlementReadSnapshot(() =>
    withBankingTelemetryBatch(db, turn, async () => {
      const summary = await runBankingTurn(db, turn, options);
      try {
        await publishBankLoanInterestHistory(db, turn);
      } catch (error) {
        Sentry.captureException(error, {
          tags: { operation: "publish-bank-loan-interest" },
          extra: { turn },
        });
      }
      return summary;
    })
  );
}

async function runBankingTurn(
  db: Db,
  turn: number,
  options: BankingTurnOptions = {}
): Promise<BankingTurnSummary> {
  // Persisted per-stage timings and round trips for this phase (#2689).
  const steps = substepMarker();
  await resumeReservePoolTransfers(db);
  await resumeMonetaryOperations(db, MONETARY_OPERATION_COOLDOWN_TURNS);
  await resumeLiquidityAdvances(db, MONETARY_OPERATION_COOLDOWN_TURNS);
  await resumeTreasuryReserveTransfers(db);
  steps.mark("resume");
  // One config read per turn. Every stage below decides from this snapshot,
  // so a flag flipped mid-turn cannot split the pass between two policies.
  const policy = await loadBankingPolicy(db);
  if (!policy.privateBanking) {
    const recovered = await recoverBankingSettlements(db, turn, policy);
    return {
      ...ZERO_BANKING_TURN_SUMMARY,
      recovery: {
        resumedSettlements: recovered.resumedSettlements.length,
        stillPartial: recovered.stillPartial.length,
        estatesRecovered: recovered.estatesRecovered.length,
        estatesStillResolving: recovered.estatesStillResolving.length,
      },
    };
  }
  const centralBankPricing = await loadCentralBankPricingAdjustment(db, turn);

  // Finish last turn's unfinished business before any new flow: a settlement
  // that crashed between two legs, an estate claimed and never settled. Doing
  // it first means nothing below builds on money still in flight.
  const recovered = await recoverBankingSettlements(db, turn, policy);
  steps.mark("recovery");
  const recovery = {
    resumedSettlements: recovered.resumedSettlements.length,
    stillPartial: recovered.stillPartial.length,
    estatesRecovered: recovered.estatesRecovered.length,
    estatesStillResolving: recovered.estatesStillResolving.length,
  };

  // CB docs load once up front — bank rates and the savings APY both key off
  // them, so the per-corp getEffectiveBankRates findOne is unnecessary.
  type CbLite = Pick<
    CentralBank,
    "_id" | "primeRate" | "inflationHistory" | "externalBroadMoney" | "chairInfamy"
  >;
  // EVERY active charter, not only the deposit takers. The old query filtered
  // on retail/universal, so an investment bank's named loans were originated
  // (lending.ts allows it) and then never serviced: no interest, no principal,
  // no arrears, forever. Deposit and household-funding stages still run only
  // for deposit-taking charters; loan servicing runs for any charter with a
  // loan book.
  const [corps, banks] = await Promise.all([
    // The banking stages read the charter, cash and deposit book. The
    // settlement stamps on the same document are most of its bytes and are
    // only read by the journal, under its own projection.
    corporationsCollection(db)
      .find({ "bankCharter.status": "active" }, { projection: SETTLEMENT_HISTORY_EXCLUDED })
      .toArray(),
    centralBanksCollection(db)
      .find({})
      .project({ _id: 1, primeRate: 1, inflationHistory: 1, externalBroadMoney: 1, chairInfamy: 1 })
      .toArray() as Promise<CbLite[]>,
  ]);
  const cbById = new Map<string, CbLite>();
  for (const b of banks) {
    cbById.set(typeof b._id === "string" ? b._id : String(b._id), b);
  }

  const depositTakers: DepositTaker[] = [];
  const loanBookOnly: LoanBookOnlyBank[] = [];
  for (const corp of corps) {
    const charter = corp.bankCharter;
    if (!charter || !charterMay(charter, "serviceLoanBook")) continue;
    if (charter.lastBankingTurn === turn) continue;
    if (charterMay(charter, "acceptNpcFunding")) {
      const cb = cbById.get(getBankId(getCountryIdForCurrency(charter.currency)));
      const rates = effectiveBankRatesFromPrime(charter, cb?.primeRate);
      depositTakers.push({ corp, charter, rates });
    } else {
      loanBookOnly.push({ corp, charter });
    }
  }

  const resolveCbApy = (currency: CurrencyCode): number => {
    const bankId = getBankId(getCountryIdForCurrency(currency));
    const cb = cbById.get(bankId);
    const prime =
      typeof cb?.primeRate === "number" && Number.isFinite(cb.primeRate) ? cb.primeRate : 0;
    const inflation = cb?.inflationHistory?.at(-1)?.rate ?? 0;
    return savingsApyPercent(prime, inflation, centralBankPricing.depositBonusPercentPoints);
  };

  const premiumReceiptByKey = await loadInsurancePremiumReceiptsForTurn(
    db,
    depositTakers.map((row) => ({
      bankId: row.corp._id,
      charteredTurn: row.charter.charteredTurn ?? 0,
    })),
    turn
  );

  // Competing deposit shares once per currency, among the deposit takers.
  const byCurrency = new Map<CurrencyCode, DepositTaker[]>();
  for (const row of depositTakers) {
    const c = row.charter.currency as CurrencyCode;
    const list = byCurrency.get(c) ?? [];
    list.push(row);
    byCurrency.set(c, list);
  }
  const npcShareByBankId = new Map<string, number>();
  for (const [currency, peers] of byCurrency) {
    const shares = computeNpcDepositShare(
      peers.map((p) => ({
        bankId: p.corp._id.toString(),
        effectiveDepositRatePercent: p.rates.depositRatePercent,
      })),
      resolveCbApy(currency)
    );
    // B4 market effect: deposit flight. When the currency's central bank is
    // discredited, NPC households move part of their savings into foreign
    // currency, so domestic banks capture a smaller share. The rest is not
    // destroyed, it simply stays outside the domestic banks, so the money
    // supply books still balance. Floored, and exactly 1 for a clean bank.
    const retention = domesticDepositRetention(
      cbById.get(getBankId(getCountryIdForCurrency(currency)))?.chairInfamy ?? 0
    );
    for (const s of shares) {
      npcShareByBankId.set(s.bankId, s.share * retention);
    }
  }

  const summary: BankingTurnSummary = { ...ZERO_BANKING_TURN_SUMMARY, recovery };
  steps.mark("load");

  // Banks settle in bounded lanes. Each holds every document its pass writes:
  // itself, its currency's household pool (which the pass also reads through
  // the shared in-memory central bank, so same-currency banks keep their
  // order), the currency's insurance fund, and each depositor and borrower.
  // A depositor saving in two currencies at two banks orders those banks.
  const lockKeysByBank = await bankPassLockKeys(db, turn, depositTakers);
  const lock = new KeyedQueue();
  // The per-bank reads that do not depend on the bank's pass. Both are
  // turn-level snapshots, so hoisting them cannot reorder a money movement.
  const passCaches: BankPassCaches = { npcShareByBankId, cbById, premiumReceiptByKey };
  if (options.batchPerBankReads !== false && depositTakers.length > 0) {
    const sectors = await corporateSectorsCollection(db)
      .find(
        {
          corporationId: { $in: depositTakers.map((row) => row.corp._id) },
          sectorType: "financial",
        },
        {
          projection: {
            corporationId: 1,
            capitalStock: 1,
            revenue: 1,
            strategyId: 1,
            sectorType: 1,
          },
        }
      )
      .toArray();
    const byBank = new Map<string, CorporateSector[]>();
    for (const row of depositTakers) byBank.set(row.corp._id.toString(), []);
    for (const sector of sectors) {
      const id = sector.corporationId?.toString();
      if (!id) continue;
      const list = byBank.get(id) ?? [];
      list.push(sector);
      byBank.set(id, list);
    }
    passCaches.depositCeilingSectorsByBankId = byBank;
    passCaches.txThresholds = await loadTxThresholds(db);
    passCaches.eraUnitScale = await loadWorldEraUnitScale(db);
  }
  const runBank = async (row: DepositTaker) => {
    const bankResult = await lock.run(lockKeysByBank.get(row.corp._id.toString()) ?? [], () =>
      processOneBank(db, turn, row, passCaches, policy)
    );
    summary.banksProcessed += 1;
    summary.depositInterestPaid += bankResult.depositInterestPaid;
    summary.depositInterestShortfall += bankResult.depositInterestShortfall;
    summary.loanInterestCollected += bankResult.loanInterestCollected;
    summary.loanPrincipalRepaid += bankResult.loanPrincipalRepaid;
    summary.defaultsWrittenOff += bankResult.defaultsWrittenOff;
    summary.npcDepositDelta += bankResult.npcDepositDelta;
    summary.npcBulkShortfall += bankResult.npcBulkShortfall;
    summary.premiumShortfall += bankResult.premiumShortfall;
  };
  await runInLanes(
    interleaveByKey(depositTakers, (row) => String(row.charter.currency)),
    BANKING_LANES,
    runBank
  );

  steps.mark("depositTakers");

  // Charters with a loan book but no deposit base: the named loans still have
  // to advance every turn, exactly as they do for a deposit taker.
  for (const row of loanBookOnly) {
    const loanResult = await processLoanBookOnlyBank(db, turn, row);
    if (!loanResult) continue;
    summary.banksProcessed += 1;
    summary.loanInterestCollected += loanResult.interestCollected;
    summary.loanPrincipalRepaid += loanResult.principalRepaid;
    summary.defaultsWrittenOff += loanResult.writtenOff;
  }

  steps.mark("loanBookOnly");

  // Loans owed to wound-up banks. No live bank's pass covers them; without this pass, borrowers stopped paying and the value never reached the people who lost out.
  const deadBankStarted = Date.now();
  const deadBankResult = await processDeadBankLoans(
    db,
    turn,
    async (loan, bank, target, trackInsuranceRecovery, txEntries, prefetch) => {
      if (loan.borrowerType === "npcBulk") {
        const recovered = await serviceDeadNpcBulkLoan(
          db,
          turn,
          loan,
          bank.currency,
          target,
          trackInsuranceRecovery,
          prefetch?.householdPool
        );
        return {
          collected: recovered.collected,
          interestCollected: recovered.interest,
          principalRepaid: recovered.principal,
          writtenOff: recovered.writtenOff,
          ...(recovered.replayed ? { replayed: true } : {}),
        };
      }
      const serviced = await servicePlayerLoan(
        db,
        turn,
        bank.corporationId,
        loan,
        bank.currency,
        bank.name,
        target,
        trackInsuranceRecovery,
        txEntries,
        prefetch?.borrower
      );
      return {
        collected: serviced.bankCredit,
        interestCollected: serviced.interestCollected,
        principalRepaid: serviced.principalRepaid,
        writtenOff: serviced.writtenOff,
        paidLocal: serviced.paidLocal,
        replayed: serviced.replayed,
        partial: serviced.partial,
      };
    }
  );
  summary.deadBankLoansServiced = deadBankResult.loansServiced;
  summary.loanInterestCollected += deadBankResult.interestCollected;
  summary.loanPrincipalRepaid += deadBankResult.principalRepaid;
  summary.defaultsWrittenOff += deadBankResult.defaultsWrittenOff;
  summary.deadBankRecoveredToEstate = deadBankResult.recoveredToEstate;
  summary.deadBankRecoveredToInsurer = deadBankResult.recoveredToInsurer;
  recordBankingStage(db, turn, "deadBankLoans", Date.now() - deadBankStarted);
  steps.mark("deadBankLoans");

  await timedBankingStage(db, turn, "interbank", () =>
    serviceInterbankAndCbMargin(db, turn, summary, policy.propTrading, cbById)
  );
  steps.mark("interbank");

  if (policy.bankTreasury) {
    await timedBankingStage(db, turn, "bankTreasury", async () => {
      await processBankTreasuryTurn(db, turn, policy);
    });
  }

  // What this pass leaves behind for the repair queue. Reported on the turn
  // summary so a half-applied move shows up in phase results the same turn,
  // not when somebody thinks to open the admin page.
  steps.mark("bankTreasury");
  summary.unfinishedSettlements = await bankMoneyMovesCollection<Document>(db).countDocuments({
    status: "partial",
  });
  steps.mark("unfinishedCount");

  return summary;
}

/** Concurrent bank passes; a shared document still orders them. */
const BANKING_LANES = 8;

type LoanBookOnlyBank = { corp: Corporation; charter: BankCharter };

/**
 * The banking pass for a charter that lends but takes no deposits (today: an
 * investment bank). No household funding, no deposit interest, no insurance
 * premium, no NPC book; just the named loans it has originated, serviced on
 * the same terms as any other lender's, and the same end-of-pass stamp.
 */
async function processLoanBookOnlyBank(
  db: Db,
  turn: number,
  row: LoanBookOnlyBank
): Promise<LoanServiceResult | null> {
  const { corp } = row;
  const live = await corporationsCollection(db).findOne({ _id: corp._id }, BANK_CHARTER_ONLY);
  const charter = live?.bankCharter;
  if (!isNamedLendingCharter(charter) || charter.lastBankingTurn === turn) return null;
  // Not the type guard: a deposit taker is handled by processOneBank, and the
  // guard's else branch would narrow the charter to never.
  if (charterCapabilities(charter).acceptNpcFunding.allowed) return null;

  const currency = charter.currency as CurrencyCode;
  const serviced = await timedBankingStage(db, turn, "loanServicing", () =>
    serviceNamedLoanBook(db, turn, corp, currency, charter.charteredTurn)
  );

  const corporations = corporationsCollection(db);
  let publicationCharter = charter;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    if (attempt > 0) {
      const latest = await corporations.findOne(
        { _id: corp._id },
        { projection: { countryId: 1, bankCharter: 1 } }
      );
      if (
        !isNamedLendingCharter(latest?.bankCharter) ||
        latest.bankCharter.charteredTurn !== charter.charteredTurn ||
        latest.bankCharter.currency !== charter.currency
      ) {
        return serviced;
      }
      if (latest.bankCharter.lastBankingTurn === turn) return serviced;
      publicationCharter = latest.bankCharter;
    }

    const unbooked = unbookedSovereignAssetIncome(publicationCharter);
    const underwritingFeesForTurn =
      publicationCharter.lastBankingUnderwritingFeesTurn === turn
        ? (publicationCharter.lastBankingUnderwritingFees ?? 0)
        : 0;
    const publication = await corporations.updateOne(
      bankingTurnPublicationFilter({
        bankId: corp._id,
        countryId: corp.countryId,
        charteredTurn: charter.charteredTurn,
        currency,
        turn,
        observedIncomeTurn: publicationCharter.lastBankingIncomeTurn,
        observedSovereignCouponIncome: publicationCharter.lastBankingSovereignCouponIncome,
        observedTreasuryRealizedGain: publicationCharter.lastBankingTreasuryRealizedGain,
        observedSovereignCouponPaidLifetime: publicationCharter.sovereignCouponIncomePaidLifetime,
        observedSovereignCouponBookedLifetime:
          publicationCharter.sovereignCouponIncomeBookedLifetime,
        observedTreasuryGainPaidLifetime: publicationCharter.treasuryRealizedGainPaidLifetime,
        observedTreasuryGainBookedLifetime: publicationCharter.treasuryRealizedGainBookedLifetime,
        observedUnderwritingFeesTurn: publicationCharter.lastBankingUnderwritingFeesTurn,
        observedUnderwritingFees: publicationCharter.lastBankingUnderwritingFees,
      }),
      {
        $set: {
          // Cash and the loan book moved through their original receipts. An
          // end-of-pass snapshot must not overwrite a concurrent origination,
          // repayment or collateral recovery.
          "bankCharter.lastBankingTurn": turn,
          "bankCharter.lastBankingIncome":
            serviced.interestCollected -
            serviced.writtenOff +
            unbooked.couponIncome +
            unbooked.realizedGain +
            underwritingFeesForTurn,
          "bankCharter.lastBankingIncomeTurn": turn,
          // No deposit base, so no deposit interest and no premium; the loan
          // split still applies for the console breakdown.
          "bankCharter.lastBankingDepositInterest": 0,
          "bankCharter.lastBankingLoanInterest": serviced.interestCollected,
          "bankCharter.lastBankingSovereignCouponIncome": unbooked.couponIncome,
          "bankCharter.lastBankingTreasuryRealizedGain": unbooked.realizedGain,
          "bankCharter.sovereignCouponIncomeBookedLifetime":
            publicationCharter.sovereignCouponIncomePaidLifetime ?? 0,
          "bankCharter.treasuryRealizedGainBookedLifetime":
            publicationCharter.treasuryRealizedGainPaidLifetime ?? 0,
          "bankCharter.lastBankingLoanOriginationFees": 0,
          "bankCharter.lastBankingUnderwritingFees": underwritingFeesForTurn,
          "bankCharter.lastBankingUnderwritingFeesTurn": turn,
          "bankCharter.lastBankingInterbankInterestPaid": 0,
          "bankCharter.lastBankingInterbankInterestReceived": 0,
          "bankCharter.lastBankingFacilityInterest": 0,
          "bankCharter.lastBankingInsurancePremium": 0,
          "bankCharter.lastBankingWriteoffs": serviced.writtenOff,
          updatedAt: new Date(),
        },
      }
    );
    if (publication.matchedCount > 0) return serviced;
  }
  throw new Error(`Bank ${corp._id.toHexString()} income publication changed too often`);
}

/**
 * The per-loan path for one household tranche of a wound-up bank. The batch
 * takes the same decision through `npcBulkInstalment`; this stays for a
 * tranche the pooled debit could not carry, and for the tests that compare the
 * two.
 */
export async function serviceDeadNpcBulkLoan(
  db: Db,
  turn: number,
  loan: BankLoan,
  currency: CurrencyCode,
  creditTarget: MoneyTarget,
  trackInsuranceRecovery: boolean,
  preloadedHouseholdPool?: number
): Promise<{
  collected: number;
  interest: number;
  principal: number;
  writtenOff: number;
  replayed?: boolean;
  partial?: boolean;
}> {
  const empty = { collected: 0, interest: 0, principal: 0, writtenOff: 0 };
  if (loan.lastProcessedTurn === turn) return empty;

  const cbDocId = getBankId(getCountryIdForCurrency(currency));
  const cb =
    preloadedHouseholdPool === undefined
      ? await centralBanksCollection(db).findOne({ _id: cbDocId }, BROAD_MONEY_ONLY)
      : undefined;
  const pool =
    preloadedHouseholdPool === undefined
      ? Math.max(0, cb?.externalBroadMoney ?? 0)
      : Math.max(0, preloadedHouseholdPool);
  const defaultRate = getCreditBand(loan.creditBand).defaultRatePercent;
  const instalment = npcBulkInstalment({
    outstanding: loan.outstanding ?? 0,
    ratePercent: loan.ratePercent ?? 0,
    defaultRatePercent: defaultRate,
    currency,
    householdPool: pool,
  });
  const { principal, interest, writtenOff, outstanding, collected } = instalment;
  const key = `npc-loan-service:${loan._id.toString()}:${turn}`;
  const settled = await settleTransition(db, {
    key,
    kind: "npc_loan_service",
    turn,
    currency,
    legs:
      collected > 0
        ? [
            {
              kind: "debit",
              amount: collected,
              collection: "centralBanks",
              filter: { _id: cbDocId, externalBroadMoney: { $gte: collected } },
              path: "externalBroadMoney",
              note: "NPC household repayment leaves the central bank household pool",
            },
            {
              kind: "credit",
              amount: collected,
              collection: creditTarget.collection,
              filter: creditTarget.filter,
              path: creditTarget.path,
              note: creditTarget.note,
            },
          ]
        : [],
    projections: [
      {
        collection: "bankLoans",
        filter: { _id: loan._id, lastProcessedTurn: { $ne: turn } },
        update: {
          $set: {
            outstanding,
            principal: Math.max(loan.principal ?? 0, outstanding),
            status: outstanding <= 0 ? "repaid" : "current",
            lastProcessedTurn: turn,
          },
        },
        note: "the resolved charter's household tranche follows its repayment",
      },
      ...(trackInsuranceRecovery && creditTarget.collection === "depositInsuranceFunds"
        ? [
            {
              collection: "depositInsuranceFunds",
              filter: creditTarget.filter,
              update: { $inc: { measuredRecoveriesSincePricingStart: collected } },
              note: "Record borrower cash recovered for a measured resolved insurance claim",
            },
          ]
        : []),
    ],
    event: {
      kind: "loan.paid",
      command: "bank.household.service",
      amount: collected,
      meta: { borrowerType: "npcBulk", charteredTurn: loanCharterEpoch(loan) },
    },
  });
  if (settled.status === "partial" || settled.status === "rejected" || settled.error) {
    throw new Error(settled.error ?? "Resolved household loan recovery could not settle");
  }
  if (settled.status === "replayed") return { ...empty, replayed: true };
  return { collected, interest, principal, writtenOff };
}
