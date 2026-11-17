import { serviceNpcBulkBook } from "@/lib/banking/npcBulkLoanService";

import { creditIncomeAfterTax } from "@/lib/budget/incomePayout";

import { ObjectId, type Db } from "mongodb";

import type { Corporation, CorporateSector } from "@/lib/db/types";
import type { BankCharter } from "@/lib/db/types/bank";
import type { CentralBank } from "@/lib/db/types/centralBank";
import type { CurrencyCode } from "@/lib/constants/currencies";
import { getCountryIdForCurrency } from "@/lib/constants/currencies";
import { getBankId } from "@/lib/centralBank/helpers";
import { type BankingPolicySnapshot } from "@/lib/banking/policy";

import { savingsReadsAuthoritative } from "@/lib/banking/rules/policy";

import { emitBankingAuditEvent } from "@/lib/banking/auditEvents";
import { recordBankingStage } from "@/lib/banking/telemetry";

import { equityCappedDepositCeiling } from "@/lib/banking/deposits";

import {
  bankingTurnPublicationFilter,
  insurancePremiumBasisForTurn,
  insurancePremiumReceiptKey,
  settleInsurancePremiumForTurn,
  type FrozenInsurancePremiumReceipt,
} from "@/lib/banking/insurancePremium";
import { unbookedSovereignAssetIncome } from "@/lib/banking/rules/sovereignClaims";
import { npcFlowDelta, perTurnInterest } from "@/lib/banking/rules/loans";
import { settleLegacyDepositInterest } from "@/lib/banking/legacyDepositInterest";
import { settleTransition } from "@/lib/banking/settlementJournal";
import { oid } from "@/lib/banking/rules/boundary";
import { playerDepositRatePercent } from "@/lib/banking/rates";
import { depositCeilingFromSectors, getBankDepositCeiling } from "@/lib/banking/capacityAllocation";
import { roundSavingsAmount } from "@/lib/currency/savingsInterest";

import { emitTxBulk, loadTxThresholds } from "@/lib/financialTxLog/emit";
import type { TxThresholds } from "@/lib/db/types/financialTxLog";
import { loadWorldEraUnitScale } from "@/lib/currency/gdpAnchorRate";
import { isDepositTakingCharter } from "@/lib/banking/charterKinds";

import { getCashReserves, bankEquity } from "@/lib/banking/bankCash";

import { serviceNamedLoanBook } from "@/lib/banking/namedLoanBook";

import { turnMoveKey } from "@/lib/banking/moneyMove";

import { corporationsCollection } from "@/lib/db/repositories/corporations";
import { charactersCollection } from "@/lib/db/repositories/characters";

export type DepositTaker = {
  corp: Corporation;
  charter: BankCharter;
  rates: { depositRatePercent: number; lendingRatePercent: number };
};

export type BankPassCaches = {
  eraUnitScale?: number;
  npcShareByBankId: Map<string, number>;
  premiumReceiptByKey: Map<string, FrozenInsurancePremiumReceipt>;
  cbById: Map<
    string,
    Pick<CentralBank, "_id" | "primeRate" | "inflationHistory" | "externalBroadMoney">
  >;
  /** Batched mode: financial sectors per deposit taker, read once for the cohort. */
  depositCeilingSectorsByBankId?: ReadonlyMap<
    string,
    readonly Pick<CorporateSector, "capitalStock" | "revenue" | "strategyId" | "sectorType">[]
  >;
  /** Batched mode: the turn's transaction-log thresholds, read once. */
  txThresholds?: TxThresholds;
};

export type BankPassResult = {
  loanOriginationFeesCollected: number;
  depositInterestPaid: number;
  depositInterestShortfall: number;
  loanInterestCollected: number;
  loanPrincipalRepaid: number;
  defaultsWrittenOff: number;
  npcDepositDelta: number;
  npcBulkShortfall: number;
  premiumShortfall: number;
  insurancePremiumPaid: number;
  bankingIncome: number;
};

export async function processOneBank(
  db: Db,
  turn: number,
  row: DepositTaker,
  caches: BankPassCaches,
  policy: BankingPolicySnapshot
): Promise<BankPassResult> {
  const { corp, charter, rates } = row;
  const currency = charter.currency as CurrencyCode;
  const bankIdHex = corp._id.toString();
  const result: BankPassResult = {
    loanOriginationFeesCollected: 0,
    depositInterestPaid: 0,
    depositInterestShortfall: 0,
    loanInterestCollected: 0,
    loanPrincipalRepaid: 0,
    defaultsWrittenOff: 0,
    npcDepositDelta: 0,
    npcBulkShortfall: 0,
    premiumShortfall: 0,
    insurancePremiumPaid: 0,
    bankingIncome: 0,
  };

  // Re-check idempotency against live doc (concurrent / retry safety).
  const live = await corporationsCollection(db).findOne(
    { _id: corp._id },
    { projection: { liquidCapital: 1, bankCharter: 1, countryId: 1 } }
  );
  if (!live?.bankCharter || live.bankCharter.lastBankingTurn === turn) {
    return result;
  }
  if (!isDepositTakingCharter(live.bankCharter)) {
    return result;
  }

  let cashReserves = getCashReserves(live.bankCharter);
  let npcDeposits = Math.max(0, live.bankCharter.npcDeposits ?? 0);
  let totalLoans = Math.max(0, live.bankCharter.totalLoans ?? 0);
  // Once the currency's savings accounts are the book of record, the player
  // balances held here arrived as cash (the holder change moved the backing)
  // and the bank owes them exactly as it owes the household book: reserves,
  // equity, the ceiling and the loan capacity all count them from this turn.
  const playerDepositsAreLiabilities = savingsReadsAuthoritative(policy, currency);
  const sheetOptions = { playerDepositsAreLiabilities };

  // (a) Player depositors, loaded once — the total here and the interest pass
  // in (c) below use the same rows (NPC flow in (b) does not touch player
  // savings, so reading them up front is equivalent).
  const depositors = await charactersCollection(db)
    .find({ [`currencyBalances.savingsHolder.${currency}`]: bankIdHex })
    // `name` is projected for the interest ledger legs in (c): the alternative
    // is one lookup per depositor per bank per turn.
    .project({ _id: 1, name: 1, [`currencyBalances.savings.${currency}`]: 1 })
    .toArray();
  const depositorNameById = new Map(
    depositors.map((ch) => [ch._id.toString(), ch.name ?? "Depositor"])
  );
  const playerDeposits = depositors.reduce((sum, ch) => {
    const bal = ch.currencyBalances?.savings?.[currency] ?? 0;
    return sum + (typeof bal === "number" && Number.isFinite(bal) && bal > 0 ? bal : 0);
  }, 0);

  // Deposit ceiling from financial-sector capacity × branch share. Caps NPC
  // target (and therefore inflow). Outflow always allowed. Player deposits
  // alone above the ceiling are grandfathered: NPC target contribution → 0.
  const preloadedSectors = caches.depositCeilingSectorsByBankId?.get(bankIdHex);
  const capacityCeiling = preloadedSectors
    ? depositCeilingFromSectors(
        live.bankCharter,
        preloadedSectors,
        caches.eraUnitScale ?? (await loadWorldEraUnitScale(db))
      )
    : await getBankDepositCeiling(db, {
        ...corp,
        bankCharter: live.bankCharter,
        liquidCapital: live.liquidCapital,
      });
  // Capacity sizes the ceiling, but a bank may only anchor a deposit base it has
  // the capital to stand behind. Cap the ceiling at a leverage multiple of book
  // equity so an undercapitalized bank (little/negative equity) cannot grow — or
  // keep — a base far larger than its capital. Negative equity drives this to 0,
  // and the normal per-turn NPC outflow then unwinds the excess gradually.
  const depositCeiling = equityCappedDepositCeiling(
    capacityCeiling,
    bankEquity(live.bankCharter, sheetOptions)
  );
  const npcRoom = Math.max(0, depositCeiling - playerDeposits);

  // (b) NPC deposit flow - CB update first, then corp npcDeposits
  let stageStarted = Date.now();
  const stageDone = (
    stage: "funding" | "depositInterest" | "insurancePremium" | "loanServicing" | "householdBook"
  ) => {
    recordBankingStage(db, turn, stage, Date.now() - stageStarted);
    stageStarted = Date.now();
  };
  const cbDocId = getBankId(getCountryIdForCurrency(currency));
  const cb = caches.cbById.get(cbDocId);
  const externalBroadMoney =
    typeof cb?.externalBroadMoney === "number" && Number.isFinite(cb.externalBroadMoney)
      ? Math.max(0, cb.externalBroadMoney)
      : 0;
  const share = caches.npcShareByBankId.get(bankIdHex) ?? 0;
  const uncappedTargetNpc = share * externalBroadMoney;
  const targetNpc = Math.min(uncappedTargetNpc, npcRoom);
  // An outflow is capped at the cash in the vault: households cannot take out
  // what is not there. What they could not take stays on the book as deposits
  // the bank cannot pay, which is what the solvency pass fails a bank for.
  // Asking the guarded debit for more only refuses the whole flow.
  const delta = Math.max(
    npcFlowDelta(npcDeposits, targetNpc),
    -Math.floor(cashReserves * 100) / 100
  );
  if (delta !== 0) {
    // A deposit moves money: debit the central bank's household pool and credit
    // the bank's cash. Without the credit, cash is destroyed while the charter
    // counts it, so reserve tests demand cash the bank never received.
    //
    // Both legs go through the shared money-movement primitive: the idempotency
    // key is claimed before either leg lands, and a pair that does not net to
    // zero is refused.
    const inflow = delta > 0;
    const flowKey = turnMoveKey(inflow ? "npc-deposit-in" : "npc-deposit-out", bankIdHex, turn);
    const flow = await settleTransition(db, {
      key: flowKey,
      kind: "npc_deposit_flow",
      turn,
      currency,
      legs: [
        {
          kind: inflow ? "debit" : "credit",
          amount: Math.abs(delta),
          collection: "centralBanks",
          filter: { _id: cbDocId },
          path: "externalBroadMoney",
          note: inflow ? "households move money into the bank" : "households take money out",
        },
        {
          kind: inflow ? "credit" : "debit",
          amount: Math.abs(delta),
          collection: "corporations",
          filter: { _id: oid(bankIdHex), "bankCharter.status": "active" },
          path: "bankCharter.cashReserves",
          note: inflow ? "deposit arrives as vault cash" : "withdrawal leaves the vault",
        },
      ],
      // The deposit aggregate is a projection of the cash that moved: written
      // as an increment carrying the settlement's stamp, so a retried turn can
      // neither skip it nor apply it twice.
      projections: [
        {
          collection: "corporations",
          filter: { _id: oid(bankIdHex), "bankCharter.status": "active" },
          update: { $inc: { "bankCharter.npcDeposits": delta } },
          note: "household deposit aggregate follows the cash",
        },
      ],
      event: {
        kind: "account.deposited",
        command: "bank.household.flow",
        amount: delta,
        meta: { targetNpc, share },
      },
    });
    // Only what landed IN THIS PASS adjusts the figures the rest of the pass
    // decides on. A leg or projection that landed on an earlier attempt is
    // already in the document this pass read.
    if (flow.status === "applied" && flow.appliedLegs.length === 2) {
      cashReserves = Math.max(0, cashReserves + delta);
      if (cb) cb.externalBroadMoney = Math.max(0, externalBroadMoney - delta);
      result.npcDepositDelta += delta;
    }
    if (flow.newlyAppliedProjections.includes(0)) {
      npcDeposits = Math.max(0, npcDeposits + delta);
    }
  }

  stageDone("funding");

  // (c) Deposit interest - player balances + npcDeposits, paid from cashReserves
  //
  // Pointer-model pricing: player savings never arrived as vault cash, so the
  // bank pays only the premium over the CB base APY; the base accrues to the
  // saver in savingsInterestTurn. Authoritative currencies keep the full rate
  // because the backing cash is in the vault and the liability is real.
  const cbApyDoc = caches.cbById.get(cbDocId);
  const cbApyPrime =
    typeof cbApyDoc?.primeRate === "number" && Number.isFinite(cbApyDoc.primeRate)
      ? cbApyDoc.primeRate
      : 0;
  const cbApyInflation = cbApyDoc?.inflationHistory?.at(-1)?.rate ?? 0;
  const playerRatePercent = playerDepositRatePercent(
    rates.depositRatePercent,
    playerDepositsAreLiabilities,
    cbApyPrime,
    cbApyInflation
  );
  type PlayerCredit = { characterId: ObjectId; interest: number };
  const playerCredits: PlayerCredit[] = [];
  let playerInterestDue = 0;
  for (const ch of depositors) {
    const bal = ch.currencyBalances?.savings?.[currency] ?? 0;
    if (!(bal > 0)) continue;
    const interest = perTurnInterest(bal, playerRatePercent, currency);
    if (interest <= 0) continue;
    playerCredits.push({ characterId: ch._id, interest });
    playerInterestDue += interest;
  }
  const npcInterestDue = perTurnInterest(npcDeposits, rates.depositRatePercent, currency);
  const totalInterestDue = playerInterestDue + npcInterestDue;

  const interestShortfall = Math.max(0, totalInterestDue - cashReserves);
  let interestScale = 1;
  if (totalInterestDue > cashReserves && totalInterestDue > 0) {
    interestScale = cashReserves / totalInterestDue;
    result.depositInterestShortfall += totalInterestDue - cashReserves;
  }

  const creditOps: {
    updateOne: { filter: object; update: object };
  }[] = [];
  let playerInterestPaid = 0;
  for (const pc of playerCredits) {
    const paid = roundSavingsAmount(pc.interest * interestScale, currency);
    if (paid <= 0) continue;
    playerInterestPaid += paid;
    creditOps.push({
      updateOne: {
        filter: { _id: pc.characterId },
        update: {
          $inc: {
            [`currencyBalances.savings.${currency}`]: paid,
            [`currencyBalances.interestEarned.${currency}`]: paid,
          },
          $set: { updatedAt: new Date() },
        },
      },
    });
  }
  // Persist the original allocation before paying any legacy saver. The shell
  // keeps recipient writes batched and recovery verifies every target receipt.
  const interestMoveKey = turnMoveKey("deposit-interest", bankIdHex, turn);
  let playerInterestSettled = 0;
  let playerInterestWithheld = 0;
  const netInterestByCharacter = new Map<string, number>();
  let legacyInterestDebit = 0;
  let legacyNewCredits = new Map<string, number>();
  let npcInterestPaid = roundSavingsAmount(npcInterestDue * interestScale, currency);

  if (
    playerInterestPaid > 0 &&
    creditOps.length > 0 &&
    policy.savingsAccounts === "authoritative"
  ) {
    // Under the account model the interest does not leave the vault: the
    // depositor's claim grows, the bank's liability grows by the same amount,
    // and the cash stays where it is as that claim's backing. Paying it out of
    // the vault as well would charge the bank twice (once in cash, once in
    // liability) and leave the account's backing short by exactly the
    // interest. So this is a settlement with no legs and a projection per
    // account, each stamped, so a crash part-way finishes on the next attempt
    // and a replay credits nothing twice.
    const credits = playerCredits
      .map((pc) => ({ pc, paid: roundSavingsAmount(pc.interest * interestScale, currency) }))
      .filter(({ paid }) => paid > 0);
    const settledIncome = await creditIncomeAfterTax(
      db,
      "bank-interest:" + bankIdHex,
      turn,
      new Date(),
      credits.map(({ pc, paid }) => ({
        characterId: pc.characterId,
        ownerCollection: "characters" as const,
        currency,
        gross: paid,
        income: paid,
        destination: "currencyBalances.savings." + currency,
        interest: { authoritative: true, bankId: corp._id },
      }))
    );
    const withheld = settledIncome.reduce((sum, credit) => sum + credit.gross - credit.net, 0);
    for (const credit of settledIncome)
      netInterestByCharacter.set(credit.characterId.toHexString(), credit.net);
    playerInterestWithheld = withheld;
    cashReserves = Math.max(0, cashReserves - withheld);
    playerInterestSettled = playerInterestPaid;
    {
      const thresholds = caches.txThresholds ?? (await loadTxThresholds(db));
      await emitTxBulk(
        db,
        credits.map(({ pc, paid }) => ({
          type: "bank_deposit_interest" as const,
          turn,
          createdAt: new Date(),
          subjectType: "character" as const,
          subjectId: pc.characterId,
          subjectName: depositorNameById.get(pc.characterId.toString()) ?? "Depositor",
          amount: paid,
          currencyCode: currency,
          counterpartyType: "corporation" as const,
          counterpartyId: corp._id,
          counterpartyName: corp.name,
          meta: {
            ratePercent: playerRatePercent,
            retainedAsBacking: true,
            incomeTaxAtSource: true,
          },
        })),
        thresholds
      );
    }
  } else if (policy.savingsAccounts !== "authoritative") {
    const settled = await settleLegacyDepositInterest(db, {
      key: interestMoveKey,
      bankId: corp._id,
      bankName: corp.name,
      currency,
      charteredTurn: charter.charteredTurn,
      turn,
      npcInterestPaid,
      ratePercent: playerRatePercent,
      shortfall: interestShortfall,
      credits: playerCredits
        .map((pc) => ({
          characterId: pc.characterId,
          amount: roundSavingsAmount(pc.interest * interestScale, currency),
          name: depositorNameById.get(pc.characterId.toString()) ?? "Depositor",
        }))
        .filter((credit) => credit.amount > 0),
    });
    playerInterestSettled = settled.paid;
    playerInterestWithheld = settled.withheld ?? 0;
    legacyInterestDebit = settled.newlyDebited;
    legacyNewCredits = settled.newlyCredited;
    npcInterestPaid = settled.npcInterestPaid;
    result.depositInterestShortfall += settled.shortfall - interestShortfall;
    if (legacyInterestDebit > 0 || legacyNewCredits.size > 0)
      emitBankingAuditEvent(
        {
          kind: "account.interest_paid",
          command: "bank.turn.depositInterest",
          turn,
          outcome: "ok",
          bankId: bankIdHex,
          currency,
          amount: settled.paid,
          settlementId: interestMoveKey,
        },
        db
      );
  }

  const totalInterestPaid = playerInterestSettled + npcInterestPaid;
  if (totalInterestPaid > 0) {
    // Only the PLAYER half leaves the building. A player's interest is credited
    // to `currencyBalances.savings`, which is their own balance sheet, so the
    // cash goes with it. An NPC household's interest is credited to the account
    // it already holds AT this bank: the liability grows and the cash stays
    // exactly where it is.
    //
    // The player half already moved in the database above; this keeps the
    // in-memory figure the rest of the pass decides on in step with it. Under
    // the account model nothing left: the interest stayed in the vault as the
    // account's backing and the liability grew instead.
    if (policy.savingsAccounts !== "authoritative") {
      cashReserves = Math.max(0, cashReserves - legacyInterestDebit);
    }
    npcDeposits = Math.max(0, npcDeposits + npcInterestPaid);
    result.depositInterestPaid += totalInterestPaid;
  }

  stageDone("depositInterest");

  // (c2) Deposit insurance premium - after interest, before loan servicing.
  // insuredDeposits ≈ Σ min(playerBal, cap) + npcDeposits (NPC fully insured).
  const paidByCharId = new Map<string, number>();
  for (const op of creditOps) {
    const id = String((op.updateOne.filter as { _id: ObjectId })._id);
    const paid =
      (op.updateOne.update as { $inc?: Record<string, number> }).$inc?.[
        `currencyBalances.savings.${currency}`
      ] ?? 0;
    paidByCharId.set(
      id,
      policy.savingsAccounts === "authoritative"
        ? (netInterestByCharacter.get(id) ?? paid)
        : (legacyNewCredits.get(id) ?? 0)
    );
  }
  const premiumBasis = await insurancePremiumBasisForTurn(db, {
    currency,
    depositorSavings: depositors.map((ch) => ({
      id: ch._id.toString(),
      balance: ch.currencyBalances?.savings?.[currency] ?? 0,
    })),
    interestPaidByDepositor: paidByCharId,
    npcDeposits,
    playerDepositsAreLiabilities,
    playerDeposits,
    playerInterestSettled: playerInterestSettled - playerInterestWithheld,
    cashReserves,
  });
  const premium = await settleInsurancePremiumForTurn(
    db,
    {
      bankId: corp._id,
      countryId: live.countryId,
      charteredTurn: live.bankCharter.charteredTurn,
      currency,
      turn,
      insuredDeposits: premiumBasis.insuredDeposits,
      cashReserves,
      reserveRatioActual: premiumBasis.reserveRatioActual,
      reserveRatioRequired: premiumBasis.reserveRatioRequired,
    },
    caches.premiumReceiptByKey.get(
      insurancePremiumReceiptKey(corp._id, live.bankCharter.charteredTurn ?? 0, turn)
    ) ?? null
  );
  result.premiumShortfall += premium.shortfall;
  cashReserves = premium.cashReservesAfter ?? Math.max(0, cashReserves - premium.cashDebited);
  if (premium.applied) {
    result.insurancePremiumPaid += premium.premiumPaid;
  }

  stageDone("insurancePremium");

  // (d) Named loan servicing. Shared with the loan-book-only pass below.
  const namedBook = await serviceNamedLoanBook(db, turn, corp, currency, charter.charteredTurn);
  result.loanInterestCollected += namedBook.interestCollected;
  result.loanPrincipalRepaid += namedBook.principalRepaid;
  result.defaultsWrittenOff += namedBook.writtenOff;
  cashReserves += namedBook.bankCredit;
  totalLoans = Math.max(0, totalLoans + namedBook.totalLoansDelta);

  stageDone("loanServicing");

  // (e) NPC household loans. The book grows only from deposits actually held
  // by this bank after its reserve requirement. Rates set utilization, while
  // named loans consume the same capacity inside serviceNpcBulkBook.
  // Only cash-backed deposits can fund a loan; you cannot lend a pointer.
  const loanFundingCapacity =
    (npcDeposits + premiumBasis.playerCashDeposits) * (1 - premiumBasis.reserveRatioRequired);
  const bulkResult = await serviceNpcBulkBook(
    db,
    turn,
    corp._id,
    charter.charteredTurn,
    currency,
    rates.lendingRatePercent,
    {
      loanFundingCapacity,
      primeRatePercent: cb?.primeRate ?? 0,
      cashReserves,
      totalLoans,
      cbDocId,
      cb,
      bankName: corp.name,
      requiredReserves:
        (npcDeposits + premiumBasis.playerCashDeposits) * premiumBasis.reserveRatioRequired,
      lendingProfile: live.bankCharter.lendingProfile,
    }
  );
  cashReserves = bulkResult.cashReserves;
  totalLoans = bulkResult.totalLoans;
  result.loanInterestCollected += bulkResult.interestCollected;
  result.loanOriginationFeesCollected += bulkResult.feesCollected;
  result.defaultsWrittenOff += bulkResult.writtenOff;
  result.npcBulkShortfall += bulkResult.shortfall;

  stageDone("householdBook");

  // (f) Recompute aggregates + stamp lastBankingTurn (END of bank pass)
  const finalPlayerDeposits = playerDeposits + playerInterestSettled - playerInterestWithheld;
  const totalDeposits = finalPlayerDeposits + npcDeposits;
  const baseBankingIncome =
    result.loanInterestCollected +
    result.loanOriginationFeesCollected -
    result.depositInterestPaid -
    result.insurancePremiumPaid -
    result.defaultsWrittenOff;
  let publicationCharter = live.bankCharter;
  let bankingIncome = baseBankingIncome;
  let sovereignCouponIncomeForTurn = 0;
  let treasuryRealizedGainForTurn = 0;
  let underwritingFeesForTurn = 0;
  let published = false;
  let superseded = false;
  const corporations = corporationsCollection(db);
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const unbooked = unbookedSovereignAssetIncome(publicationCharter);
    sovereignCouponIncomeForTurn = unbooked.couponIncome;
    treasuryRealizedGainForTurn = unbooked.realizedGain;
    underwritingFeesForTurn =
      publicationCharter.lastBankingUnderwritingFeesTurn === turn
        ? (publicationCharter.lastBankingUnderwritingFees ?? 0)
        : 0;
    bankingIncome =
      baseBankingIncome +
      sovereignCouponIncomeForTurn +
      treasuryRealizedGainForTurn +
      underwritingFeesForTurn;

    const resultWrite = await corporations.updateOne(
      bankingTurnPublicationFilter({
        bankId: corp._id,
        countryId: live.countryId,
        charteredTurn: live.bankCharter.charteredTurn,
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
          // Cash is deliberately absent. Every movement in this pass now applies
          // its own guarded `$inc` through the money primitive, so writing the
          // in-memory figure here would silently overwrite anything that moved
          // concurrently and would resurrect money a failed leg never sent. What
          // is left are the derived aggregates, which are recomputed from the
          // ledgers each turn and are not balances anyone can claim.
          "bankCharter.npcDeposits": npcDeposits,
          "bankCharter.totalDeposits": totalDeposits,
          "bankCharter.depositCeiling": depositCeiling,
          "bankCharter.lastBankingTurn": turn,
          "bankCharter.lastBankingIncome": bankingIncome,
          "bankCharter.lastBankingIncomeTurn": turn,
          // The per-turn split behind the net above, so the console can show
          // interest paid vs earned from the ledger instead of estimating.
          // Interbank / facility legs land after this stamp and $inc both the
          // net and their own lines below, starting from zero here.
          "bankCharter.lastBankingDepositInterest": result.depositInterestPaid,
          "bankCharter.lastBankingLoanInterest": result.loanInterestCollected,
          "bankCharter.lastBankingSovereignCouponIncome": sovereignCouponIncomeForTurn,
          "bankCharter.lastBankingTreasuryRealizedGain": treasuryRealizedGainForTurn,
          "bankCharter.sovereignCouponIncomeBookedLifetime":
            publicationCharter.sovereignCouponIncomePaidLifetime ?? 0,
          "bankCharter.treasuryRealizedGainBookedLifetime":
            publicationCharter.treasuryRealizedGainPaidLifetime ?? 0,
          "bankCharter.lastBankingLoanOriginationFees": result.loanOriginationFeesCollected,
          "bankCharter.lastBankingUnderwritingFees": underwritingFeesForTurn,
          "bankCharter.lastBankingUnderwritingFeesTurn": turn,
          "bankCharter.lastBankingInterbankInterestPaid": 0,
          "bankCharter.lastBankingInterbankInterestReceived": 0,
          "bankCharter.lastBankingFacilityInterest": 0,
          "bankCharter.lastBankingInsurancePremium": result.insurancePremiumPaid,
          "bankCharter.lastBankingWriteoffs": result.defaultsWrittenOff,
          updatedAt: new Date(),
        },
      }
    );
    if (resultWrite.matchedCount === 1) {
      published = true;
      break;
    }
    const current = await corporations.findOne(
      { _id: corp._id },
      { projection: { countryId: 1, bankCharter: 1 } }
    );
    const latestCharter = current?.bankCharter;
    if (
      !latestCharter ||
      current?.countryId !== live.countryId ||
      latestCharter.status !== "active" ||
      latestCharter.charteredTurn !== live.bankCharter.charteredTurn ||
      latestCharter.currency !== currency
    ) {
      superseded = true;
      break;
    }
    if (latestCharter.lastBankingTurn === turn) {
      published = true;
      break;
    }
    publicationCharter = latestCharter;
  }
  if (!published && !superseded) {
    throw new Error(
      `Banking turn ${turn} could not publish for ${corp._id.toString()} after a concurrent charter update`
    );
  }

  result.bankingIncome = bankingIncome;

  return result;
}
