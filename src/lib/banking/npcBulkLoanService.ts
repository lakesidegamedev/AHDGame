import { quoteLoanOrigination } from "@/lib/banking/rules/loanFees";

import { ObjectId, type Db } from "mongodb";

import type { BankLoan } from "@/lib/db/types/bank";
import type { CentralBank } from "@/lib/db/types/centralBank";
import type { CurrencyCode } from "@/lib/constants/currencies";

import { TURNS_PER_YEAR } from "@/lib/constants/turnTime";

import { fundedNpcFlowDelta } from "@/lib/banking/rules/loans";

import { settleTransition } from "@/lib/banking/settlementJournal";
import { oid, type TransitionLeg, type TransitionProjection } from "@/lib/banking/rules/boundary";

import { emitTx } from "@/lib/financialTxLog/emit";

import { getCashReserves } from "@/lib/banking/bankCash";

import { loanCharterEpochFilter } from "@/lib/banking/loanEpoch";
import { turnMoveKey } from "@/lib/banking/moneyMove";
import {
  DEFAULT_LENDING_PROFILE,
  bandOriginationTargets,
  getCreditBand,
  type CreditBandId,
  type LendingProfileId,
} from "@/lib/banking/creditBands";

import { centralBanksCollection } from "@/lib/db/repositories/centralBanks";
import { corporationsCollection } from "@/lib/db/repositories/corporations";

import { bankLoansCollection } from "@/lib/db/repositories/bankLoans";
import { bankMoneyMovesCollection } from "@/lib/db/repositories/bankMoneyMoves";

export const BANK_CHARTER_ONLY = { projection: { bankCharter: 1 } };

export const BROAD_MONEY_ONLY = { projection: { externalBroadMoney: 1 } };

export /** Rolling term for the synthetic NPC bulk book (re-sized each bankingTurn). */
const NPC_BULK_TERM_TURNS = TURNS_PER_YEAR;

export type NpcBulkState = {
  primeRatePercent: number;
  /** Total lending capacity from deposits after the reserve requirement. */
  loanFundingCapacity: number;
  cashReserves: number;
  totalLoans: number;
  cbDocId: string;
  cb?: Pick<CentralBank, "externalBroadMoney">;
  bankName: string;
  /** Cash the bank must retain; origination may only spend above this. */
  requiredReserves: number;
  /** CEO's stance: which credit bands this bank will originate into. */
  lendingProfile?: LendingProfileId;
};

export type NpcBulkResult = {
  cashReserves: number;
  totalLoans: number;
  interestCollected: number;
  feesCollected: number;
  writtenOff: number;
  shortfall: number;
};

export /**
 * Service the household book, one tranche per credit band.
 *
 * Two rules govern what the CEO's lending profile may touch:
 *
 *  - It selects which bands are ORIGINATED into from here on. Bands outside
 *    the profile get a target of zero and wind down at the ordinary flow cap;
 *    they are not called in, repriced, or written off early.
 *  - A tranche already on the book keeps the rate it was originated at. Rate
 *    changes reach the book only through new origination.
 *
 * A pre-split book has no `creditBand`; it is serviced as its own tranche with
 * a target of zero at its stored rate, so it runs off gradually while banded
 * tranches build. Total size is unchanged; only composition shifts, at the
 * flow cap.
 */
async function serviceNpcBulkBook(
  db: Db,
  turn: number,
  bankCorporationId: ObjectId,
  charteredTurn: number,
  currency: CurrencyCode,
  lendingRatePercent: number,
  state: NpcBulkState
): Promise<NpcBulkResult> {
  const bankIdHex = bankCorporationId.toString();
  const settlementKey = turnMoveKey("npc-book-settlement", `${bankIdHex}:${charteredTurn}`, turn);
  const recorded = await bankMoneyMovesCollection<{
    _id: string;
    legs: TransitionLeg[];
    projections?: { projection: TransitionProjection }[];
    event?: { meta?: { originationFees?: number; interestPaid?: number; writtenOff?: number } };
  }>(db)
    // A finished settlement re-arms from its own quote (legs, projections,
    // event meta). Its receipt history and stamps are never read here and are
    // most of the record's bytes.
    .findOne({ _id: settlementKey }, { projection: { legs: 1, projections: 1, "event.meta": 1 } });
  if (recorded) {
    // The original quote owns the cash AND the book. A retry can see a pool
    // already debited by that quote, so it must finish the recorded writes
    // instead of calculating a new repayment from the smaller balance.
    const settled = await settleTransition(db, {
      key: settlementKey,
      kind: "npc_book_settlement",
      turn,
      currency,
      legs: recorded.legs,
      projections: recorded.projections?.map((row) => row.projection) ?? [],
      event: { kind: "loan.paid", command: "bank.household.service" },
    });
    if (settled.status === "partial" || settled.status === "rejected" || settled.error) {
      throw new Error(settled.error ?? "Household loan book is awaiting settlement recovery");
    }
    const [bank, loans, pool] = await Promise.all([
      corporationsCollection(db).findOne({ _id: bankCorporationId }, BANK_CHARTER_ONLY),
      bankLoansCollection(db)
        .aggregate<{ total: number }>([
          {
            $match: {
              bankCorporationId,
              status: { $in: ["current", "arrears"] },
              ...loanCharterEpochFilter(charteredTurn),
            },
          },
          { $group: { _id: null, total: { $sum: "$outstanding" } } },
        ])
        .toArray(),
      centralBanksCollection(db).findOne({ _id: state.cbDocId }, BROAD_MONEY_ONLY),
    ]);
    if (state.cb && pool) state.cb.externalBroadMoney = pool.externalBroadMoney;
    // New journals freeze the original income split with their claim. Older
    // fee receipts can still recover the fee from the protected book memo.
    const recordedFee =
      recorded.projections?.reduce((sum, row) => {
        const increment =
          row.projection.collection === "corporations" ? row.projection.update?.$inc : null;
        const value =
          increment !== null &&
          typeof increment === "object" &&
          "bankCharter.loanOriginationFeesLifetime" in increment
            ? increment["bankCharter.loanOriginationFeesLifetime"]
            : 0;
        return sum + (typeof value === "number" && Number.isFinite(value) ? value : 0);
      }, 0) ?? 0;
    return {
      cashReserves: getCashReserves(bank?.bankCharter),
      totalLoans: loans[0]?.total ?? 0,
      interestCollected: recorded.event?.meta?.interestPaid ?? 0,
      feesCollected: recorded.event?.meta?.originationFees ?? recordedFee,
      writtenOff: recorded.event?.meta?.writtenOff ?? 0,
      shortfall: 0,
    };
  }
  let { cashReserves, totalLoans } = state;
  let creditedToPool = 0;
  let interestCollected = 0;
  let feesCollected = 0;
  let writtenOff = 0;
  let shortfall = 0;

  const existing = await bankLoansCollection(db)
    .find({
      bankCorporationId,
      borrowerType: "npcBulk",
      status: { $in: ["current", "arrears"] },
      ...loanCharterEpochFilter(charteredTurn),
    })
    .toArray();

  // Idempotency: the whole book is stamped together, so one processed tranche
  // means the pass already ran for this bank this turn.
  if (existing.some((loan) => loan.lastProcessedTurn === turn)) {
    return { cashReserves, totalLoans, interestCollected, feesCollected, writtenOff, shortfall };
  }

  const currentTotal = existing.reduce((sum, loan) => sum + Math.max(0, loan.outstanding ?? 0), 0);
  const nonNpcLoans = Math.max(0, totalLoans - currentTotal);
  const npcFundingCapacity = Math.max(0, state.loanFundingCapacity - nonNpcLoans);

  const byBand = new Map<string, BankLoan>();
  const legacy: BankLoan[] = [];
  for (const loan of existing) {
    if (loan.creditBand) byBand.set(loan.creditBand, loan);
    else legacy.push(loan);
  }

  type TrancheWork = {
    loan: BankLoan | null;
    band: CreditBandId | undefined;
    target: number;
    ratePercent: number;
    defaultRatePercent: number;
  };

  const work: TrancheWork[] = [];

  // Targets come from the shared rules helper, so the console shows the same
  // numbers this loop steers toward. Demand for a band is its share of the
  // bank's funding capacity, taken at the rate that band is actually charged:
  // price still moves volume, it just moves it per band now instead of across
  // the whole book at once.
  const targets = bandOriginationTargets({
    primeRatePercent: state.primeRatePercent,
    fundingCapacity: npcFundingCapacity,
    lendingRatePercent,
    profile: state.lendingProfile,
  });
  for (const entry of targets) {
    const loan = byBand.get(entry.band) ?? null;
    if (!entry.open && !loan) continue;

    work.push({
      loan,
      band: entry.band,
      target: entry.target,
      // An existing tranche keeps its originated rate; only a fresh one prices
      // at today's rate.
      ratePercent: loan ? (loan.ratePercent ?? entry.ratePercent) : entry.ratePercent,
      defaultRatePercent: getCreditBand(entry.band).defaultRatePercent,
    });
  }

  for (const loan of legacy) {
    work.push({
      loan,
      band: undefined,
      target: 0,
      ratePercent: loan.ratePercent ?? lendingRatePercent,
      defaultRatePercent: getCreditBand(undefined).defaultRatePercent,
    });
  }

  const now = new Date();
  const bookProjections: TransitionProjection[] = [];
  /** Interest the household pool owes this bank across every credit band. */
  let interestFromPool = 0;
  let poolAvailable = Number.isFinite(state.cb?.externalBroadMoney)
    ? Math.max(0, state.cb?.externalBroadMoney ?? 0)
    : 0;

  for (const tranche of work) {
    const current = Math.max(0, tranche.loan?.outstanding ?? 0);
    const adjust = fundedNpcFlowDelta(current, tranche.target, {
      cashReserves,
      requiredReserves: state.requiredReserves,
      householdPool: poolAvailable,
    });
    // Principal changes only by what the payer can actually deliver. In
    // particular a winding-down household book cannot repay an empty pool.
    const fee = adjust > 0 ? quoteLoanOrigination(adjust, currency).originationFee : 0;
    const fundedCash = adjust - fee;
    cashReserves -= fundedCash;
    creditedToPool += fundedCash;
    poolAvailable += fundedCash;
    feesCollected += fee;

    const nextOutstandingBeforeYield = Math.max(0, current + adjust);
    if (nextOutstandingBeforeYield <= 0 && current <= 0) continue;

    totalLoans = Math.max(0, totalLoans + adjust);

    // Interest is real cash the unmodeled NPC economy pays out of the central
    // bank's externalBroadMoney pool (the named counterparty). Defaults destroy
    // loan asset only - no cash moves for a writeoff.
    const interest = (nextOutstandingBeforeYield * (tranche.ratePercent / 100)) / TURNS_PER_YEAR;
    const defaults =
      (nextOutstandingBeforeYield * (tranche.defaultRatePercent / 100)) / TURNS_PER_YEAR;

    const interestAffordable = Math.min(interest, poolAvailable);
    if (interestAffordable > 0) {
      // Accumulated rather than written per tranche: one move for the whole
      // book, so the household pool and the vault cannot be left disagreeing
      // by however many credit bands happened to be processed before a crash.
      interestFromPool += interestAffordable;
      poolAvailable -= interestAffordable;
      cashReserves += interestAffordable;
      interestCollected += interestAffordable;
    }
    if (interest > interestAffordable) {
      shortfall += interest - interestAffordable;
    }
    writtenOff += defaults;

    const afterDefaults = Math.max(0, nextOutstandingBeforeYield - defaults);
    totalLoans = Math.max(0, totalLoans - defaults);

    if (tranche.loan) {
      bookProjections.push({
        collection: "bankLoans",
        filter: { _id: oid(tranche.loan._id.toString()) },
        update: {
          $set: {
            charteredTurn,
            outstanding: afterDefaults,
            principal: Math.max(tranche.loan.principal ?? 0, afterDefaults),
            ratePercent: tranche.ratePercent,
            status: afterDefaults <= 0 ? "repaid" : "current",
            lastProcessedTurn: turn,
          },
        },
        note: "household tranche follows the settled principal and interest",
      });
    } else if (afterDefaults > 0) {
      bookProjections.push({
        collection: "bankLoans",
        insert: {
          _id: oid(new ObjectId().toString()),
          bankCorporationId: oid(bankIdHex),
          charteredTurn,
          currency,
          borrowerType: "npcBulk",
          creditBand: tranche.band,
          principal: afterDefaults,
          outstanding: afterDefaults,
          ratePercent: tranche.ratePercent,
          originatedTurn: turn,
          termTurns: NPC_BULK_TERM_TURNS,
          status: "current",
          lastProcessedTurn: turn,
        },
        note: "new household tranche is backed by the settled loan proceeds",
      });
    }
  }

  if (bookProjections.length > 0) {
    bookProjections.push({
      collection: "corporations",
      filter: { _id: oid(bankIdHex) },
      update: {
        $inc: {
          "bankCharter.totalLoans": totalLoans - state.totalLoans,
          ...(feesCollected > 0
            ? { "bankCharter.loanOriginationFeesLifetime": feesCollected }
            : {}),
        },
      },
      note: "the cached loan total follows the household book",
    });
    // Principal and interest share one net cash transfer and one recorded
    // book. The journal keeps the original quote through every retry, including
    // a crash between the money movement and the first tranche write.
    const netToPool = creditedToPool - interestFromPool;
    const amount = Math.abs(netToPool);
    const settled = await settleTransition(db, {
      key: settlementKey,
      kind: "npc_book_settlement",
      turn,
      currency,
      legs:
        amount > 0
          ? [
              {
                kind: netToPool > 0 ? "debit" : "credit",
                amount,
                collection: "corporations",
                filter: { _id: oid(bankIdHex) },
                path: "bankCharter.cashReserves",
                note: "the lending bank's vault",
              },
              {
                kind: netToPool > 0 ? "credit" : "debit",
                amount,
                collection: "centralBanks",
                filter: { _id: state.cbDocId },
                path: "externalBroadMoney",
                note: "the household money pool",
              },
            ]
          : [],
      projections: bookProjections,
      event: {
        kind: "loan.paid",
        command: "bank.household.service",
        amount: interestFromPool,
        meta: {
          tranches: work.length,
          interestPaid: interestFromPool,
          originationFees: feesCollected,
          writtenOff,
        },
      },
    });
    if (settled.status === "partial" || settled.status === "rejected" || settled.error) {
      throw new Error(settled.error ?? "Household loan book could not settle");
    }
    if (state.cb) state.cb.externalBroadMoney = poolAvailable;
  }

  // The book's interest belongs to ring-fenced reserves, not parent-company cash.
  if (interestCollected > 0) {
    await emitTx(db, {
      type: "bank_npc_loan_interest",
      turn,
      createdAt: now,
      subjectType: "corporation",
      subjectId: bankCorporationId,
      subjectName: state.bankName,
      amount: interestCollected,
      currencyCode: currency,
      counterpartyType: "system",
      counterpartyName: "NPC households",
      meta: {
        borrowerType: "npcBulk",
        bankVaultMovement: true,
        tranches: work.length,
        lendingProfile: state.lendingProfile ?? DEFAULT_LENDING_PROFILE,
      },
    });
  }

  return { cashReserves, totalLoans, interestCollected, feesCollected, writtenOff, shortfall };
}
