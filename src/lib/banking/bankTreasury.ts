import { ObjectId, type Db } from "mongodb";
import type { CurrencyCode } from "@/lib/constants/currencies";
import type { Bond } from "@/lib/db/types/bond";
import type { BankCharter, BankTreasuryTradeReceipt } from "@/lib/db/types/bank";
import type { Corporation } from "@/lib/db/types/corporation";
import type { BankingPolicySnapshot } from "@/lib/banking/rules/policy";
import { savingsReadsAuthoritative } from "@/lib/banking/rules/policy";
import {
  planBankTreasurySweep,
  allocateBankTreasuryHolderLots,
  bankTreasuryAllocatedCostBasis,
  quoteBankTreasuryBond,
  type BankTreasurySweepCandidate,
} from "@/lib/banking/rules/bankTreasury";
import {
  bondPoolCurrency,
  loadBondPoolsByCurrency,
  type LoadedBondQuote,
  loadBondQuote,
} from "@/lib/bonds/marketPool";
import { resumeSettlement } from "@/lib/banking/settlementJournal";
import { quoteSovereignPrimaryBankPurchase } from "./rules/sovereignPrimary";
import { getNationalBudgetId } from "@/lib/bonds/sovereign";
import {
  loadPrimaryAccounting,
  primaryFinancingRate,
} from "@/lib/bonds/sovereignPrimarySettlement";
import {
  BANK_TREASURY_TRADES_COLLECTION,
  type BankState,
  type BankTreasuryPosition,
  type BankTreasuryOverview,
  type BankTreasuryTradeResult,
  roundLocal,
  holderLotInputs,
  freezeHolderSnapshot,
  activeHolderUnits,
  poolSnapshot,
  bankCashFloor,
} from "./bankTreasuryShared";
export {
  BANK_TREASURY_TRADES_COLLECTION,
  type BankTreasuryPosition,
  type BankTreasuryOverview,
  type BankTreasuryTradeResult,
} from "./bankTreasuryShared";
import { markBankTreasury, runReceipt } from "./bankTreasuryReceipt";
import { federalBudgetCollection } from "@/lib/db/repositories/federalBudget";
import { bondsCollection } from "@/lib/db/repositories/bonds";

/** Load only same-currency sovereign bills and pool cash while the feature is enabled. */
export async function getBankTreasuryOverview(
  db: Db,
  bankId: ObjectId,
  policy: BankingPolicySnapshot,
  turn: number
): Promise<BankTreasuryOverview | null> {
  if (!policy.bankTreasury) return null;
  const bank = await db
    .collection<BankState>("corporations")
    .findOne(
      { _id: bankId, "bankCharter.status": "active" },
      { projection: { bankCharter: 1, name: 1 } }
    );
  const charter = bank?.bankCharter;
  if (!charter) return null;
  const currency = charter.currency;
  const bonds = await bondsCollection(db)
    .find({
      issuerType: "sovereign",
      matured: { $ne: true },
      defaulted: { $ne: true },
      $and: [
        { $or: [{ currencyCode: currency }, { currencyCode: { $exists: false } }] },
        {
          $or: [
            { publicFloat: { $gt: 0 } },
            ...(policy.sovereignPrimary ? [{ unsoldUnits: { $gt: 0 } }] : []),
            { holders: { $elemMatch: { bankId, charteredTurn: charter.charteredTurn } } },
          ],
        },
      ],
    })
    .toArray();
  const pools = await loadBondPoolsByCurrency(db);
  const cashFloor = await bankCashFloor(
    db,
    charter,
    savingsReadsAuthoritative(policy, currency),
    bankId
  );
  const cashReserves = Math.max(0, charter.cashReserves ?? 0);
  const positions: BankTreasuryPosition[] = [];
  const primaryOffers: NonNullable<BankTreasuryOverview["primaryOffers"]> = [];
  for (const bond of bonds) {
    const bondCurrency = bondPoolCurrency(bond);
    if (bondCurrency !== currency) continue;
    const pool = poolSnapshot(pools.get(currency));
    const quote: LoadedBondQuote = await loadBondQuote(db, bond, {
      pools: new Map([[currency, pool]]),
    });
    const pure = quoteBankTreasuryBond({
      bond,
      currency,
      currentTurn: turn,
      poolCashLocal: quote.poolCashLocal,
      poolTargetCashLocal: quote.targetCashLocal,
      appetite: quote.appetite,
    });
    const units = activeHolderUnits(bond.holders ?? [], bankId, charter.charteredTurn);
    const position: BankTreasuryPosition = {
      bondId: bond._id.toHexString(),
      issuer: bond.issuerName ?? bond.countryId ?? "Sovereign",
      countryId: String(bond.countryId ?? ""),
      currency,
      units,
      maturityTurn: bond.maturityTurn,
      remainingTurns: pure.remainingTurns,
      couponRate: bond.couponRate,
      bidPerUnitLocal: quote.bidPerUnit,
      askPerUnitLocal: quote.askPerUnit,
      annualizedContractYieldPercent: pure.annualizedContractYieldPercent,
      executablePoolDepthUnits: quote.depthUnitsAtBid,
      publicFloatUnits: pure.publicFloatUnits,
      markedValueLocal: roundLocal(units * quote.bidPerUnit, currency),
      eligibleToBuy: pure.eligible,
    };
    if ((bond.publicFloat ?? 0) > 0 || units > 0) positions.push(position);
    if (
      policy.sovereignPrimary &&
      (bond.unsoldUnits ?? 0) > 0 &&
      ["investment", "universal"].includes(charter.type) &&
      bond.maturityTurn > turn &&
      bond.currencyCode === currency &&
      !bond.sovereignMaturityClaim
    )
      primaryOffers.push({ ...position, unsoldUnits: bond.unsoldUnits! });
  }
  positions.sort((a, b) => a.remainingTurns - b.remainingTurns || a.bondId.localeCompare(b.bondId));
  return {
    currency,
    cashReserves,
    cashFloor,
    spendableCash: Math.max(0, cashReserves - cashFloor.floorLocal),
    markValueLocal: roundLocal(
      positions.reduce((sum, row) => sum + row.markedValueLocal, 0),
      currency
    ),
    autoSweep: charter.sovereignTreasuryAutoSweep === true,
    fundingRatePercent: cashFloor.fundingRatePercent,
    positions,
    ...(policy.sovereignPrimary ? { primaryOffers } : {}),
  };
}

async function loadQuoteForTrade(
  db: Db,
  bond: Bond,
  currency: CurrencyCode,
  turn: number
): Promise<{
  quote: LoadedBondQuote;
  eligible: boolean;
  annualizedContractYieldPercent: number;
}> {
  const pools = await loadBondPoolsByCurrency(db);
  const snapshot = poolSnapshot(pools.get(currency));
  const quote = await loadBondQuote(db, bond, { pools: new Map([[currency, snapshot]]) });
  const pure = quoteBankTreasuryBond({
    bond,
    currency,
    currentTurn: turn,
    poolCashLocal: quote.poolCashLocal,
    poolTargetCashLocal: quote.targetCashLocal,
    appetite: quote.appetite,
  });
  return {
    quote,
    eligible: pure.eligible,
    annualizedContractYieldPercent: pure.annualizedContractYieldPercent,
  };
}

function terminalTradeResult(receipt: BankTreasuryTradeReceipt): BankTreasuryTradeResult | null {
  if (receipt.status === "open") return null;
  if (receipt.status === "completed") {
    return {
      status: "completed",
      tradeId: receipt._id,
      side: receipt.side,
      units: receipt.units,
      amountLocal: receipt.amountLocal,
    };
  }
  return {
    status: "rejected",
    tradeId: receipt._id,
    side: receipt.side,
    units: receipt.units,
    amountLocal: receipt.amountLocal,
    error: receipt.error ?? "The frozen treasury trade was rejected",
  };
}

/** Execute one frozen manual or automatic trade through durable inventory and cash receipts. */
export async function tradeBankTreasuryBill(
  db: Db,
  input: {
    bankId: ObjectId;
    bondId: ObjectId;
    side: "buy" | "sell";
    units: number;
    turn: number;
    policy: BankingPolicySnapshot;
    tradeId?: string;
    allowFailedEstate?: boolean;
    primary?: boolean;
    maxCostLocal?: number;
    automaticSweep?: boolean;
  }
): Promise<BankTreasuryTradeResult> {
  if (!input.policy.bankTreasury || (input.primary && !input.policy.sovereignPrimary))
    return {
      status: "rejected",
      tradeId: input.tradeId ?? "disabled",
      side: input.side,
      units: 0,
      amountLocal: 0,
      error: "Bank treasury bills are disabled",
    };
  const units = Math.floor(input.units);
  if (!Number.isSafeInteger(units) || units <= 0)
    return {
      status: "rejected",
      tradeId: input.tradeId ?? "invalid",
      side: input.side,
      units: 0,
      amountLocal: 0,
      error: "Units must be a positive whole number",
    };
  const tradeId = input.tradeId ?? new ObjectId().toHexString();
  const prior = await db
    .collection<BankTreasuryTradeReceipt>(BANK_TREASURY_TRADES_COLLECTION)
    .findOne({ _id: tradeId });
  if (prior) {
    if (
      prior.bankId.toString() !== input.bankId.toString() ||
      prior.bondId.toString() !== input.bondId.toString() ||
      prior.side !== input.side ||
      prior.requestedUnits !== units ||
      Boolean(prior.primary) !== Boolean(input.primary) ||
      (prior.primary && prior.primary.maxCostLocal !== input.maxCostLocal)
    )
      throw new Error("Treasury trade key is already bound to a different frozen intent");
    const terminal = terminalTradeResult(prior);
    if (terminal && prior.primary && prior.status === "completed") {
      const finished = await resumeSettlement(db, `bank-treasury:${prior._id}:cash`);
      if (finished.error || !["applied", "replayed"].includes(finished.status))
        return { ...terminal, status: "pending", error: finished.error };
    }
    if (terminal) return terminal;
    return runReceipt(db, prior, input.policy);
  }
  const [bank, bond] = await Promise.all([
    db
      .collection<BankState>("corporations")
      .findOne({ _id: input.bankId }, { projection: { bankCharter: 1 } }),
    bondsCollection(db).findOne({ _id: input.bondId }),
  ]);
  const charter = bank?.bankCharter;
  const exactFailedEstate =
    input.allowFailedEstate === true &&
    input.side === "sell" &&
    charter?.status === "failed" &&
    charter.depositorsResolvedTurn == null;
  if (!charter || !bond || (charter.status !== "active" && !exactFailedEstate))
    return {
      status: "rejected",
      tradeId: input.tradeId ?? "missing",
      side: input.side,
      units,
      amountLocal: 0,
      error: "Active bank or open failed estate and sovereign bill are required",
    };
  if (input.automaticSweep && charter.sovereignTreasuryAutoSweep !== true)
    return {
      status: "rejected",
      tradeId: input.tradeId ?? "automatic-sweep-disabled",
      side: input.side,
      units: 0,
      amountLocal: 0,
      error: "Automatic bill buying is no longer enabled for this bank",
    };
  if (
    bond.issuerType !== "sovereign" ||
    bond.defaulted ||
    bond.matured ||
    bondPoolCurrency(bond) !== charter.currency
  ) {
    return {
      status: "rejected",
      tradeId: input.tradeId ?? "ineligible",
      side: input.side,
      units,
      amountLocal: 0,
      error: "Only live same-currency sovereign bills are eligible",
    };
  }
  const quoteState = await loadQuoteForTrade(db, bond, charter.currency, input.turn);
  if (input.side === "buy" && !input.primary && !quoteState.eligible)
    return {
      status: "rejected",
      tradeId: input.tradeId ?? "ineligible",
      side: input.side,
      units,
      amountLocal: 0,
      error: "Bill is outside the 48-turn maturity window or has no float",
    };
  const pricePerUnitLocal =
    input.side === "buy" ? quoteState.quote.askPerUnit : quoteState.quote.bidPerUnit;
  if (!(pricePerUnitLocal > 0))
    return {
      status: "rejected",
      tradeId: input.tradeId ?? "no-quote",
      side: input.side,
      units,
      amountLocal: 0,
      error: "No executable market quote is available",
    };
  let fillUnits = units;
  if (input.side === "buy") {
    const floor = await bankCashFloor(
      db,
      charter,
      savingsReadsAuthoritative(input.policy, charter.currency),
      input.bankId
    );
    if (
      input.automaticSweep &&
      (!Number.isFinite(quoteState.annualizedContractYieldPercent) ||
        !Number.isFinite(floor.fundingRatePercent) ||
        quoteState.annualizedContractYieldPercent <= floor.fundingRatePercent)
    )
      return {
        status: "rejected",
        tradeId: input.tradeId ?? "negative-carry",
        side: input.side,
        units: 0,
        amountLocal: 0,
        error: "The current bill quote does not cover the bank's funded liability rate",
      };
    const available = Math.max(0, (charter.cashReserves ?? 0) - floor.floorLocal);
    fillUnits = Math.min(
      fillUnits,
      input.primary ? (bond.unsoldUnits ?? 0) : (bond.publicFloat ?? 0),
      Math.floor(available / pricePerUnitLocal)
    );
  } else {
    const availableLots = activeHolderUnits(
      bond.holders ?? [],
      input.bankId,
      charter.charteredTurn
    );
    fillUnits = Math.min(fillUnits, availableLots, quoteState.quote.depthUnitsAtBid);
  }
  if (fillUnits <= 0)
    return {
      status: "rejected",
      tradeId: input.tradeId ?? "no-depth",
      side: input.side,
      units: 0,
      amountLocal: 0,
      error:
        input.side === "buy"
          ? "No cash is available above the bank treasury floor"
          : "The pool cannot fund a sale of this size",
    };
  let amountLocal = roundLocal(fillUnits * pricePerUnitLocal, charter.currency);
  const allocations =
    input.side === "sell"
      ? allocateBankTreasuryHolderLots(
          holderLotInputs(bond.holders ?? []),
          input.bankId.toHexString(),
          charter.charteredTurn,
          fillUnits
        )
      : undefined;
  if (
    input.side === "sell" &&
    allocations?.reduce((sum, allocation) => sum + allocation.units, 0) !== fillUnits
  ) {
    return {
      status: "rejected",
      tradeId,
      side: input.side,
      units: 0,
      amountLocal: 0,
      error: "Held lots changed before sale reservation",
    };
  }
  const costBasisLocal =
    input.side === "sell" && allocations
      ? bankTreasuryAllocatedCostBasis(
          holderLotInputs(bond.holders ?? []),
          allocations,
          charter.currency
        )
      : null;
  let primary: BankTreasuryTradeReceipt["primary"];
  if (input.primary) {
    if (input.side !== "buy") throw new Error("Primary offers can only be subscribed");
    const floor = await bankCashFloor(
      db,
      charter,
      savingsReadsAuthoritative(input.policy, charter.currency),
      input.bankId
    );
    const planned = quoteSovereignPrimaryBankPurchase({
      charter,
      bond,
      turn: input.turn,
      requestedUnits: units,
      askPerUnit: pricePerUnitLocal,
      bidPerUnit: quoteState.quote.bidPerUnit,
      maxCostLocal: input.maxCostLocal ?? 0,
      floorLocal: floor.floorLocal,
      playerDepositsAreLiabilities: savingsReadsAuthoritative(input.policy, charter.currency),
    });
    if (!planned.ok)
      return {
        status: "rejected",
        tradeId,
        side: input.side,
        units: 0,
        amountLocal: 0,
        error: planned.error,
      };
    fillUnits = planned.units;
    amountLocal = roundLocal(planned.cost, charter.currency);
    const budgetId = getNationalBudgetId(bond.countryId!);
    const budget = await federalBudgetCollection(db).findOne(
      { _id: budgetId },
      { projection: { currencyCode: 1 } }
    );
    if (!budget || budget.currencyCode !== charter.currency)
      return {
        status: "rejected",
        tradeId,
        side: input.side,
        units: 0,
        amountLocal: 0,
        error: "The issuer has no matching funded Treasury cash account",
      };
    const accounting = await loadPrimaryAccounting(db);
    const localPerAnchor = primaryFinancingRate(accounting, bond.countryId!, charter.currency);
    if (!localPerAnchor || !Number.isFinite(localPerAnchor) || localPerAnchor <= 0)
      throw new Error("Missing sovereign primary cash valuation");
    primary = {
      countryId: bond.countryId!,
      budgetId,
      annualCoupon: planned.annualCoupon,
      markPerUnitLocal: quoteState.quote.bidPerUnit,
      maxCostLocal: input.maxCostLocal!,
      localPerAnchor,
      ledgerShadow: accounting.ledgerShadow,
      ledgerTurn: accounting.ledgerTurn ?? input.turn,
      cashReservesAtQuote: charter.cashReserves!,
      balanceGuard: Object.fromEntries(
        [
          "npcDeposits",
          "playerDeposits",
          "totalDeposits",
          "totalLoans",
          "propBookMarkValue",
          "sovereignTreasuryMarkValue",
          "discountWindowDebt",
          "discountWindowArrears",
          "cbMarginDebt",
          "cbMarginArrears",
          "interbankDebt",
          "capitalStanding",
          "depositOffset",
        ].map((field) => {
          const value = charter[field as keyof BankCharter];
          return [`bankCharter.${field}`, value === undefined ? { $exists: false } : value];
        })
      ),
    };
  }
  const now = new Date();
  const receipt: BankTreasuryTradeReceipt = {
    _id: tradeId,
    bankId: input.bankId,
    charteredTurn: charter.charteredTurn,
    bondId: input.bondId,
    currency: charter.currency,
    side: input.side,
    requestedUnits: units,
    units: fillUnits,
    ...(primary ? { primary } : {}),
    ...(allocations ? { allocations } : {}),
    ...(costBasisLocal !== null ? { costBasisLocal } : {}),
    ...(allocations ? { holderSnapshot: freezeHolderSnapshot(bond.holders ?? []) } : {}),
    pricePerUnitLocal,
    amountLocal,
    turn: input.turn,
    status: "open",
    ...(exactFailedEstate ? { resolutionSale: true as const } : {}),
    createdAt: now,
    updatedAt: now,
  };
  try {
    await db
      .collection<BankTreasuryTradeReceipt>(BANK_TREASURY_TRADES_COLLECTION)
      .insertOne(receipt);
  } catch (error) {
    const code =
      typeof error === "object" && error !== null && "code" in error
        ? (error as { code?: unknown }).code
        : undefined;
    if (code !== 11000) throw error;
    const saved = await db
      .collection<BankTreasuryTradeReceipt>(BANK_TREASURY_TRADES_COLLECTION)
      .findOne({ _id: tradeId });
    if (
      !saved ||
      saved.bankId.toString() !== input.bankId.toString() ||
      saved.bondId.toString() !== input.bondId.toString() ||
      saved.side !== input.side ||
      saved.requestedUnits !== units ||
      Boolean(saved.primary) !== Boolean(input.primary) ||
      (saved.primary && saved.primary.maxCostLocal !== input.maxCostLocal) ||
      saved.charteredTurn !== charter.charteredTurn
    ) {
      throw new Error("Treasury trade key is already bound to a different frozen intent");
    }
    const terminal = terminalTradeResult(saved);
    if (terminal) return terminal;
    return runReceipt(db, saved, input.policy);
  }
  return runReceipt(db, receipt, input.policy);
}

/** Resume open receipts before any new automatic sweep orders. */
export async function recoverBankTreasuryTrades(
  db: Db,
  policy: BankingPolicySnapshot,
  limit = 100
): Promise<{ completed: number; pending: number; rejected: number }> {
  if (!policy.bankTreasury) return { completed: 0, pending: 0, rejected: 0 };
  const receipts = await db
    .collection<BankTreasuryTradeReceipt>(BANK_TREASURY_TRADES_COLLECTION)
    .find({ status: "open" })
    .sort({ createdAt: 1, _id: 1 })
    .limit(limit)
    .toArray();
  const summary = { completed: 0, pending: 0, rejected: 0 };
  for (const receipt of receipts) {
    const result = await runReceipt(db, receipt, policy);
    summary[result.status] += 1;
  }
  return summary;
}

/** Sell actual pool depth before a failed estate's cash waterfall closes. */
export async function liquidateFailedBankTreasury(
  db: Db,
  bankId: ObjectId,
  policy: BankingPolicySnapshot,
  turn: number
): Promise<{ soldUnits: number; proceedsLocal: number; pending: boolean; error?: string }> {
  if (!policy.bankTreasury) return { soldUnits: 0, proceedsLocal: 0, pending: false };
  const recovery = await recoverBankTreasuryTrades(db, policy);
  if (recovery.pending > 0) {
    return {
      soldUnits: 0,
      proceedsLocal: 0,
      pending: true,
      error: "A prior treasury trade is still settling",
    };
  }
  const bank = await db.collection<BankState>("corporations").findOne(
    {
      _id: bankId,
      "bankCharter.status": "failed",
      $or: [
        { "bankCharter.depositorsResolvedTurn": null },
        { "bankCharter.depositorsResolvedTurn": { $exists: false } },
      ],
    },
    { projection: { bankCharter: 1 } }
  );
  const charter = bank?.bankCharter;
  if (!charter) return { soldUnits: 0, proceedsLocal: 0, pending: false };
  const bonds = await bondsCollection(db)
    .find({
      issuerType: "sovereign",
      matured: { $ne: true },
      defaulted: { $ne: true },
      // A due bond is being redeemed at par through the bank maturity claim,
      // which pays this estate's vault while it is open and deposit insurance
      // once it closes. Its frozen quote refuses holder trades, so selling it
      // here would only fail and hold the whole waterfall.
      maturityTurn: { $gt: turn },
      sovereignMaturityClaim: { $exists: false },
      holders: {
        $elemMatch: {
          bankId,
          charteredTurn: charter.charteredTurn,
          bankTreasuryTradeId: { $exists: false },
          units: { $gt: 0 },
        },
      },
    })
    .sort({ maturityTurn: 1, _id: 1 })
    .toArray();
  let soldUnits = 0;
  let proceedsLocal = 0;
  for (const initial of bonds) {
    while (true) {
      const bond = await bondsCollection(db).findOne({ _id: initial._id });
      if (!bond || bond.matured || bond.defaulted) break;
      const lots = activeHolderUnits(bond.holders ?? [], bankId, charter.charteredTurn);
      if (lots <= 0) break;
      const quoteState = await loadQuoteForTrade(db, bond, charter.currency, turn);
      const units = Math.min(lots, quoteState.quote.depthUnitsAtBid);
      if (units <= 0) break;
      const receiptSequence = await db
        .collection<BankTreasuryTradeReceipt>(BANK_TREASURY_TRADES_COLLECTION)
        .countDocuments({
          bankId,
          charteredTurn: charter.charteredTurn,
          bondId: bond._id,
          turn,
          resolutionSale: true,
        });
      const result = await tradeBankTreasuryBill(db, {
        bankId,
        bondId: bond._id,
        side: "sell",
        units,
        turn,
        policy,
        tradeId: `estate-sale-${bankId.toHexString()}-${charter.charteredTurn}-${turn}-${bond._id.toHexString()}-${receiptSequence}`,
        allowFailedEstate: true,
      });
      if (result.status === "pending") {
        return {
          soldUnits,
          proceedsLocal,
          pending: true,
          error: result.error ?? "Estate treasury sale is still settling",
        };
      }
      if (result.status === "rejected")
        return { soldUnits, proceedsLocal, pending: false, error: result.error };
      soldUnits += result.units;
      proceedsLocal = roundLocal(proceedsLocal + result.amountLocal, charter.currency);
    }
  }
  return { soldUnits, proceedsLocal, pending: false };
}

/** Recompute the charter-epoch mark; its source remains the actual bond holders and pool bids. */
export async function refreshBankTreasuryMark(
  db: Db,
  bankId: ObjectId,
  policy: BankingPolicySnapshot,
  turn: number
): Promise<number> {
  if (!policy.bankTreasury) return 0;
  const bank = await db
    .collection<BankState>("corporations")
    .findOne(
      { _id: bankId, "bankCharter.status": { $in: ["active", "failed"] } },
      { projection: { bankCharter: 1 } }
    );
  if (!bank?.bankCharter) return 0;
  return markBankTreasury(db, bankId, bank.bankCharter, turn);
}

/**
 * Re-mark a bank right after a sovereign maturity paid face value into its
 * vault.
 *
 * The banking phase marks treasuries before the bond phase redeems them, so
 * until the next banking phase the vault holds the redemption cash AND the
 * mark still values the matured lots: the same money counted twice, inflating
 * equity, the withdrawable figure, and the supervisor's rating for that
 * window. The mark skips matured bonds, so re-marking removes them.
 */
export async function remarkBankTreasuryAfterMaturity(
  db: Db,
  bankId: ObjectId,
  turn: number
): Promise<number | null> {
  const bank = await db
    .collection<BankState>("corporations")
    .findOne(
      { _id: bankId, "bankCharter.status": { $in: ["active", "failed"] } },
      { projection: { bankCharter: 1 } }
    );
  if (!bank?.bankCharter) return null;
  return markBankTreasury(db, bankId, bank.bankCharter, turn);
}

/** Automatic cash sweep. Trade IDs are stable across a turn replay. */
export async function sweepBankTreasury(
  db: Db,
  bankId: ObjectId,
  policy: BankingPolicySnapshot,
  turn: number
): Promise<{ trades: number; completed: number; pending: number }> {
  if (!policy.bankTreasury) return { trades: 0, completed: 0, pending: 0 };
  const overview = await getBankTreasuryOverview(db, bankId, policy, turn);
  if (!overview?.autoSweep || overview.spendableCash <= 0)
    return { trades: 0, completed: 0, pending: 0 };
  const bank = await db
    .collection<BankState>("corporations")
    .findOne({ _id: bankId, "bankCharter.status": "active" }, { projection: { bankCharter: 1 } });
  if (!bank?.bankCharter || bank.bankCharter.lastTreasurySweepTurn === turn)
    return { trades: 0, completed: 0, pending: 0 };
  const plannedTrades = planBankTreasurySweep(
    overview.positions.map((position): BankTreasurySweepCandidate => ({
      bondId: position.bondId,
      remainingTurns: position.remainingTurns,
      publicFloatUnits: position.publicFloatUnits ?? 0,
      askPerUnitLocal: position.askPerUnitLocal,
      annualizedContractYieldPercent:
        position.annualizedContractYieldPercent ?? Number.NEGATIVE_INFINITY,
      eligible: position.eligibleToBuy,
    })),
    overview.cashReserves,
    overview.cashFloor.floorLocal,
    overview.fundingRatePercent
  );
  let trades = 0;
  let completed = 0;
  let pending = 0;
  for (const planned of plannedTrades) {
    const current = await db
      .collection<BankState>("corporations")
      .findOne({ _id: bankId }, { projection: { bankCharter: 1 } });
    const charter = current?.bankCharter;
    if (!charter || charter.status !== "active") break;
    const freshFloor = await bankCashFloor(
      db,
      charter,
      savingsReadsAuthoritative(policy, charter.currency),
      bankId
    );
    if ((charter.cashReserves ?? 0) <= freshFloor.floorLocal) break;
    const tradeId = `sweep-${bankId.toHexString()}-${charter.charteredTurn}-${turn}-${planned.bondId}`;
    const result = await tradeBankTreasuryBill(db, {
      bankId,
      bondId: new ObjectId(planned.bondId),
      side: "buy",
      units: planned.units,
      turn,
      policy,
      tradeId,
      automaticSweep: true,
    });
    trades += 1;
    if (result.status === "completed") completed += 1;
    if (result.status === "pending") pending += 1;
    if (result.status === "rejected") break;
  }
  await db.collection<Corporation>("corporations").updateOne(
    {
      _id: bankId,
      "bankCharter.status": "active",
      "bankCharter.charteredTurn": bank.bankCharter.charteredTurn,
      "bankCharter.lastTreasurySweepTurn": { $ne: turn },
    },
    { $set: { "bankCharter.lastTreasurySweepTurn": turn, updatedAt: new Date() } }
  );
  return { trades, completed, pending };
}

/** Force marks and open trades to be advanced from the banking turn only when enabled. */
export async function processBankTreasuryTurn(
  db: Db,
  turn: number,
  policy: BankingPolicySnapshot
): Promise<{
  banksMarked: number;
  tradesCompleted: number;
  tradesPending: number;
  sweepsCompleted: number;
}> {
  if (!policy.bankTreasury)
    return { banksMarked: 0, tradesCompleted: 0, tradesPending: 0, sweepsCompleted: 0 };
  const recovered = await recoverBankTreasuryTrades(db, policy);
  if (recovered.pending > 0)
    throw new Error("Bank treasury has a trade receipt that remains partial after recovery");
  const banks = await db
    .collection<BankState>("corporations")
    .find({ "bankCharter.status": "active" })
    .project({ _id: 1, bankCharter: 1 })
    .toArray();
  let tradesCompleted = 0;
  let tradesPending = 0;
  let sweepsCompleted = 0;
  for (const bank of banks) {
    if (!bank.bankCharter) continue;
    await refreshBankTreasuryMark(db, bank._id, policy, turn);
    if (bank.bankCharter.sovereignTreasuryAutoSweep) {
      const sweep = await sweepBankTreasury(db, bank._id, policy, turn);
      tradesCompleted += sweep.completed;
      tradesPending += sweep.pending;
      sweepsCompleted += sweep.completed;
    }
  }
  if (tradesPending > 0)
    throw new Error("Bank treasury automatic sweep remains partial after recovery");
  return { banksMarked: banks.length, tradesCompleted, tradesPending, sweepsCompleted };
}
