/**
 * Winding up a sponsored fund.
 *
 * A sponsor cannot simply close a fund holding other people's money. Wind-up is
 * a state, not an event:
 *
 *   active → winding_down → (holdings sold, holders paid) → delisted
 *
 * While winding down the fund stops taking subscriptions and charging fees.
 * Cash payouts, unit removal and completion commit together. New sponsors
 * hold ordinary units; legacy funds keep their original residual seed rights.
 */

import { ObjectId, type Db } from "mongodb";
import type { Corporation } from "@/lib/db/types";
import type { IndexFund, IndexFundPosition, IndexFundTransaction } from "@/lib/db/types/indexFund";
import type { CurrencyCode } from "@/lib/constants/currencies";
import {
  anchorToCorpLiquidCapital,
  getCorpFxRate,
  resolveCorpLiquidCurrencyCode,
} from "@/lib/currency/corporationCapital";
import { creditCorpLiquidCapital } from "@/lib/financialTxLog/atomicCashGuard";
import { emitTx } from "@/lib/financialTxLog/emit";
import { sellFundHoldingsForRedemptionCash } from "@/lib/indexFunds/fundRedemptionLiquidity";
import { sellFundBondHoldingsForCash } from "@/lib/bonds/sellFundBondUnits";
import { payCorporateWindUpHolders } from "./corporateHolderPayout";
import { payFundHolderCash } from "./holderPayout";
import { withSessionDb, afterCommit } from "@/lib/db/sessionDb";
import { recordAudit } from "@/lib/audit/recordAudit";
import { isForexEnabled } from "@/lib/currency/featureFlag";
import { listPendingRedemptions } from "@/lib/indexFunds/fundQueries";
import { remainingRedemptionUnits } from "@/lib/indexFunds/fundRedemptionQueue";
import {
  processQueuedRedemptions,
  QUEUED_REDEMPTION_CLAIMS_PER_PASS,
  type QueuedRedemptionClaimBudget,
} from "@/lib/indexFunds/processQueuedRedemptions";

const FUND_TX = "indexFundTransactions";
const POSITIONS = "indexFundPositions";

export type WindUpResult =
  { ok: false; error: string; status: number } | { ok: true; status: IndexFund["status"] };

/**
 * Sponsor initiates wind-up. Idempotent: a fund already winding down or
 * delisted is left alone rather than restarted.
 */
export async function beginWindUp(
  db: Db,
  fund: IndexFund,
  currentTurn: number
): Promise<WindUpResult> {
  if (!fund.sponsorCorporationId)
    return { ok: false, error: "Only a sponsored fund can be wound up.", status: 400 };
  if (fund.status === "winding_down" || fund.status === "delisted")
    return { ok: true, status: fund.status };

  const claim = await db.collection<IndexFund>("indexFunds").updateOne(
    { _id: fund._id, status: { $in: ["active", "paused"] } },
    {
      $set: {
        status: "winding_down",
        windDownStartedAtTurn: currentTurn,
        updatedAt: new Date(),
      },
    }
  );
  if (claim.modifiedCount === 0)
    return { ok: false, error: "This fund is no longer open.", status: 409 };

  recordAudit({
    source: "api",
    action: "indexFund.windUp.begin",
    category: "money",
    turn: currentTurn,
    ts: new Date(),
    subject: { type: "corporation", id: fund.sponsorCorporationId, name: fund.sponsorName ?? "" },
    outcome: "ok",
    meta: { fundId: fund._id, tickerSymbol: fund.tickerSymbol, unitSupply: fund.unitSupply },
  });

  return { ok: true, status: "winding_down" };
}

export interface WindDownPassResult {
  fundsProcessed: number;
  fundsCompleted: number;
  holdersPaid: number;
  errors: string[];
}

/**
 * NAV a cash-only fund can actually pay: its cash split over every unit still
 * owed, held in positions or waiting in the redemption queue. Shaved by a
 * relative hair so float rounding can never pay the queue more than the cash
 * (the remainder falls to the final holder payout). Zero when nothing is owed
 * or there is no cash.
 */
export function cashSupportedWindUpNav(
  cashAnchor: number,
  positionUnits: number,
  queuedUnits: number
): number {
  const units = Math.max(0, positionUnits) + Math.max(0, queuedUnits);
  if (!Number.isFinite(cashAnchor) || cashAnchor <= 0 || !(units > 0)) return 0;
  return (cashAnchor / units) * (1 - 1e-9);
}

/**
 * Pay a cash-only winding-down fund's queued redemptions before completion.
 * The regular redemption pass only serves active or backing-paused funds, so
 * claims queued before (or during) a wind-up would otherwise block it forever.
 * Queued holders are paid at the same cash-supported NAV the remaining holders
 * get at completion, so neither side gains at the other's expense.
 *
 * Returns whether claims are still waiting after this pass.
 */
async function settleWindDownQueue(
  db: Db,
  fund: IndexFund,
  currentTurn: number,
  forexEnabled: boolean,
  budget: QueuedRedemptionClaimBudget
): Promise<{ waiting: boolean; paid: number }> {
  const pending = await listPendingRedemptions(db, fund._id);
  if (pending.length === 0) return { waiting: false, paid: 0 };
  const current = await db.collection<IndexFund>("indexFunds").findOne({ _id: fund._id });
  if (!current || current.status !== "winding_down") return { waiting: false, paid: 0 };
  const positions = await db
    .collection<IndexFundPosition>(POSITIONS)
    .find({ fundId: fund._id, units: { $gt: 0 } }, { projection: { units: 1 } })
    .toArray();
  const positionUnits = positions.reduce((sum, p) => sum + p.units, 0);
  // Only rows whose units already left their position (every current request)
  // add to the denominator; legacy rows still hold theirs in the position.
  const queuedUnits = pending.reduce(
    (sum, e) => sum + (e.unitsBurnedAtRequest === true ? remainingRedemptionUnits(e) : 0),
    0
  );
  const nav = cashSupportedWindUpNav(current.cashAnchor, positionUnits, queuedUnits);
  if (nav <= 0) return { waiting: true, paid: 0 };
  // The processor re-reads the fund between payouts, so the mark must be stored.
  await db
    .collection<IndexFund>("indexFunds")
    .updateOne(
      { _id: fund._id, status: "winding_down" },
      { $set: { quotedNav: nav, updatedAt: new Date() } }
    );
  const paid = await processQueuedRedemptions(
    db,
    { ...current, quotedNav: nav },
    forexEnabled,
    currentTurn,
    false,
    budget
  );
  const left = await listPendingRedemptions(db, fund._id);
  return { waiting: left.length > 0, paid };
}

/**
 * One cron pass over every winding-down fund: sell what is left, pay any queued
 * redemptions once the portfolio is cash, and finish the fund.
 */
export async function advanceWindDowns(
  db: Db,
  currentTurn: number,
  options: { forexEnabled?: boolean } = {}
): Promise<WindDownPassResult> {
  const result: WindDownPassResult = {
    fundsProcessed: 0,
    fundsCompleted: 0,
    holdersPaid: 0,
    errors: [],
  };

  const funds = await db
    .collection<IndexFund>("indexFunds")
    .find({ status: "winding_down" })
    .toArray();

  // Funds whose stocks are gone sell their bonds this pass; they complete
  // only once no bond units remain (checked in one batched read below).
  const bondPhase: IndexFund[] = [];
  for (const fund of funds) {
    result.fundsProcessed += 1;
    try {
      if (fund.holdings.length > 0) {
        // Sell everything we can this pass. An issuer that will not take its
        // shares back simply leaves the holding for the next pass; the fund
        // stays in wind-down until the portfolio clears rather than stranding
        // holders on a partial payout.
        const holdingsValueAnchor = fund.holdings.reduce(
          (sum, h) => sum + (h.lastValueAnchor ?? 0),
          0
        );
        if (holdingsValueAnchor > 0) {
          await sellFundHoldingsForRedemptionCash(db, fund, holdingsValueAnchor, {
            note: "Wind-up liquidation",
          });
        }
        continue;
      }

      await sellFundBondHoldingsForCash(db, fund, Number.POSITIVE_INFINITY, new Date(), {
        turn: currentTurn,
      });
      bondPhase.push(fund);
    } catch (err) {
      result.errors.push(`${fund.tickerSymbol}: ${(err as Error).message}`);
    }
  }

  if (bondPhase.length === 0) return result;

  let stillHoldingBonds: Set<string>;
  try {
    const rows = await db
      .collection("bonds")
      .aggregate<{ _id: unknown }>([
        { $match: { "holders.fundId": { $in: bondPhase.map((f) => f._id) } } },
        { $unwind: "$holders" },
        {
          $match: {
            "holders.fundId": { $in: bondPhase.map((f) => f._id) },
            "holders.units": { $gt: 0 },
          },
        },
        { $group: { _id: "$holders.fundId" } },
      ])
      .toArray();
    stillHoldingBonds = new Set(rows.map((r) => String(r._id)));
  } catch (err) {
    for (const fund of bondPhase)
      result.errors.push(`${fund.tickerSymbol}: ${(err as Error).message}`);
    return result;
  }

  // shortcut: one claim budget for all wind-downs, served in fund order. A
  // fund past the budget simply continues next pass.
  const budget: QueuedRedemptionClaimBudget = { claimsLeft: QUEUED_REDEMPTION_CLAIMS_PER_PASS };
  let forexEnabled = options.forexEnabled;
  for (const fund of bondPhase) {
    if (stillHoldingBonds.has(String(fund._id))) continue;
    try {
      forexEnabled ??= await isForexEnabled();
      const queue = await settleWindDownQueue(db, fund, currentTurn, forexEnabled, budget);
      // Progress this pass: finish next pass rather than report a stall.
      if (queue.waiting && queue.paid > 0) continue;
      const paid = await completeWindUp(db, fund, currentTurn);
      result.holdersPaid += paid;
      result.fundsCompleted += 1;
    } catch (err) {
      result.errors.push(`${fund.tickerSymbol}: ${(err as Error).message}`);
    }
  }

  return result;
}

/**
 * Pay every holder at the final NAV and delist atomically. New sponsors
 * receive only their ordinary unit payout. Legacy seed rights receive any
 * remaining cash after holder distributions.
 */
export async function completeWindUp(
  db: Db,
  fund: IndexFund,
  currentTurn: number
): Promise<number> {
  return withSessionDb(db, async (tx) => {
    const current = await tx
      .collection<IndexFund>("indexFunds")
      .findOne({ _id: fund._id }, { projection: { floatSettlementPlan: 0 } });
    if (!current || current.status === "delisted") return 0;
    if (current.status !== "winding_down") throw new Error("Fund is not winding down");
    if (current.holdings.some((holding) => holding.shares > 0))
      throw new Error("Fund still holds stocks");
    const bonds = await tx
      .collection("bonds")
      .countDocuments({ holders: { $elemMatch: { fundId: fund._id, units: { $gt: 0 } } } });
    const orders = await tx
      .collection("shareOrders")
      .countDocuments({ placerFundId: fund._id, status: "open" });
    const withdrawals = await tx
      .collection("indexFundRedemptionQueue")
      .countDocuments({ fundId: fund._id, status: { $in: ["queued", "partial", "processing"] } });
    const subscriptions = await tx
      .collection("indexFundCommands")
      .countDocuments({ "subscription.fundId": fund._id, "subscription.status": "queued" });
    if (bonds || orders || withdrawals || subscriptions)
      throw new Error("Fund settlement must finish before wind-up");
    return settleWindUp(tx, current, currentTurn);
  });
}

async function settleWindUp(db: Db, fund: IndexFund, currentTurn: number): Promise<number> {
  const now = new Date();
  const positions = await db
    .collection<IndexFundPosition>(POSITIONS)
    .find({ fundId: fund._id, units: { $gt: 0 } })
    .toArray();

  const totalUnits = positions.reduce((sum, p) => sum + p.units, 0);
  // Final NAV is what the cash actually supports, not the last quote. If the
  // portfolio sold for less than it was marked at, holders take that loss here
  // rather than the sponsor covering an unfundable quote.
  const finalNav = totalUnits > 0 ? fund.cashAnchor / totalUnits : 0;

  const corporatePayout = await payCorporateWindUpHolders(
    db,
    fund,
    positions,
    finalNav,
    currentTurn,
    now
  );
  let holdersPaid = corporatePayout.holdersPaid;
  let distributedAnchor = corporatePayout.distributedAnchor;
  for (const position of positions) {
    if (position.holderKind === "corporation") continue;
    const payoutAnchor =
      fund.seedAccounting === "paid_units"
        ? position.units * finalNav
        : Math.floor(position.units * finalNav);
    if (payoutAnchor <= 0) continue;
    const paid = await payFundHolderCash(db, fund, position, payoutAnchor, currentTurn, now);
    if (!paid) {
      if (position.holderKind !== "fund_reserve") throw new Error("Fund holder payout failed");
      continue;
    }
    distributedAnchor += payoutAnchor;
    holdersPaid += 1;
  }

  await db
    .collection<IndexFundPosition>(POSITIONS)
    .updateMany({ fundId: fund._id }, { $set: { units: 0, updatedAt: now } });

  const remainingAnchor = Math.max(0, fund.cashAnchor - distributedAnchor);

  if (fund.sponsorCorporationId && remainingAnchor > 0) {
    const sponsor = await db
      .collection<Corporation>("corporations")
      .findOne({ _id: fund.sponsorCorporationId });
    if (!sponsor) throw new Error("Fund sponsor payout failed");
    if (sponsor) {
      const fxRate = await getCorpFxRate(db, sponsor);
      if (!Number.isFinite(fxRate) || fxRate <= 0)
        throw new Error("Sponsor exchange rate unavailable");
      const localAmount = anchorToCorpLiquidCapital(remainingAnchor, sponsor, fxRate);
      if (localAmount > 0) {
        await creditCorpLiquidCapital(db, sponsor._id, localAmount);
        const witness = await emitTx(db, {
          type: "corp_capital_seed",
          turn: currentTurn,
          createdAt: now,
          subjectType: "corporation",
          subjectId: sponsor._id,
          subjectName: sponsor.name,
          amount: localAmount,
          currencyCode: (resolveCorpLiquidCurrencyCode(sponsor) ?? "USD") as CurrencyCode,
          counterpartyType: "system",
          counterpartyName: fund.name,
          meta: {
            kind: "fund_seed_capital_return",
            fundId: fund._id.toString(),
            // #992 tranche 3: lets the shadow ledger mirror this row against
            // the fund cash account (fail-closed on currency mismatch).
            fundCurrency: fund.anchorCurrencyCode,
            seedCapitalAnchor: fund.seedCapitalAnchor ?? 0,
            returnedAnchor: remainingAnchor,
          },
        });
        if (witness === "failed") throw new Error("Fund residual witness failed");
      }
    }
  }

  await db.collection<IndexFundTransaction>(FUND_TX).insertOne({
    _id: new ObjectId(),
    fundId: fund._id,
    kind: "seed_capital_return",
    turn: currentTurn,
    ...(fund.sponsorCorporationId ? { corporationId: fund.sponsorCorporationId } : {}),
    amountAnchor: remainingAnchor,
    note: `Wind-up complete: ${holdersPaid} holder(s) paid, ₳${Math.round(remainingAnchor).toLocaleString()} returned to sponsor`,
    createdAt: now,
  } as IndexFundTransaction);

  await db.collection<IndexFund>("indexFunds").updateOne(
    { _id: fund._id },
    {
      $set: {
        status: "delisted",
        cashAnchor: 0,
        unitSupply: 0,
        reserveUnits: 0,
        quotedNav: finalNav,
        updatedAt: now,
      },
    }
  );

  await afterCommit(db, async () => {
    recordAudit({
      source: "turn",
      action: "indexFund.windUp.complete",
      category: "money",
      turn: currentTurn,
      ts: now,
      subject: { type: "fund", id: fund._id, name: fund.name },
      outcome: "ok",
      meta: {
        tickerSymbol: fund.tickerSymbol,
        finalNav,
        holdersPaid,
        distributedAnchor,
        returnedToSponsorAnchor: remainingAnchor,
        seedCapitalAnchor: fund.seedCapitalAnchor ?? 0,
      },
    });
  });

  return holdersPaid;
}
