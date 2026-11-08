/** Queued payouts retain forward pricing, pro rata cash and their original settlement plan. */
import { randomUUID } from "node:crypto";
import { type Db, type ObjectId, type Document, type AnyBulkWriteOperation } from "mongodb";
import type { IndexFund, IndexFundRedemptionQueueEntry } from "@/lib/db/types";
import type { CurrencyCode } from "@/lib/constants/currencies";
import { COUNTRY_CURRENCY_MAP } from "@/lib/constants/currencies";
import {
  getFundById,
  listPendingRedemptions,
  FUND_REDEMPTION_QUEUE_COLLECTION,
} from "./fundQueries";
import { loadTxThresholds } from "@/lib/financialTxLog/emit";
import { sellFundHoldingsForRedemptionCash } from "./fundRedemptionLiquidity";
import { sellFundBondHoldingsForCash } from "@/lib/bonds/sellFundBondUnits";
import { proRataRedemptionCashShare, quoteCashOnlyRedemption } from "./unitAccounting";
import { remainingRedemptionUnits } from "./fundRedemptionQueue";
import {
  isBatchablePayout,
  QUEUED_PAYOUT_BATCH_MAX,
  settleQueuedPayoutBatch,
  type PayoutBatchMember,
} from "./queuedPayoutBatch";
import {
  holderCreditTarget,
  loadQueuedPayoutAuditContext,
  recoverQueuedPayouts,
  settleQueuedPayout,
} from "./queuedPayoutSettlement";

/**
 * Queue claims one redemption pass may make, shared by every fund in the pass.
 * The pro-rata gate gives every waiting entry a slice, so an uncapped pass
 * would re-settle the whole queue each turn. Entries past the budget stay
 * untouched and go first next turn; cash they did not draw stays in the fund.
 *
 * NPP payouts settle in batches (~one claim write each), so the budget sits
 * above the NPP rebalancing inflow (~1,000 claims a turn on a 1991 world).
 */
export const QUEUED_REDEMPTION_CLAIMS_PER_PASS = 2000;

export interface QueuedRedemptionClaimBudget {
  claimsLeft: number;
}

/**
 * Per-pass context shared across every fund: pending queue rows, holder
 * documents they credit, fund-to-native rates and audit context. Loaded once
 * because none of it can change during a pass.
 */
export interface QueuedRedemptionPassContext {
  pendingByFundId: Map<string, IndexFundRedemptionQueueEntry[]>;
  /** Holder documents keyed `<collection>:<_id>`, as the payout paths expect. */
  holders: Map<string, Document>;
  nppCurrencyById: Map<string, CurrencyCode>;
  fxRateByCurrency: Map<CurrencyCode, { rate: number; ok: boolean }>;
  audit: Awaited<ReturnType<typeof loadQueuedPayoutAuditContext>>;
}

/**
 * Queue rows of every fund the pass will serve, in one read, plus their context.
 * A caller that already holds the rows (a single fund paying on its own) passes
 * them in rather than reading the queue twice.
 */
export async function prepareQueuedRedemptionPass(
  db: Db,
  funds: IndexFund[],
  forexEnabled: boolean,
  loadedPending?: IndexFundRedemptionQueueEntry[]
): Promise<QueuedRedemptionPassContext> {
  const fundIds = funds.map((fund) => fund._id);
  const pending =
    loadedPending ??
    (fundIds.length === 0
      ? []
      : await db
          .collection<IndexFundRedemptionQueueEntry>(FUND_REDEMPTION_QUEUE_COLLECTION)
          .find({ fundId: { $in: fundIds }, status: { $in: ["queued", "partial"] } })
          .sort({ createdAt: 1 })
          .toArray());
  const pendingByFundId = new Map<string, IndexFundRedemptionQueueEntry[]>();
  for (const entry of pending) {
    const key = String(entry.fundId);
    const list = pendingByFundId.get(key) ?? [];
    list.push(entry);
    pendingByFundId.set(key, list);
  }

  const holders = new Map<string, Document>();
  const nppCurrencyById = new Map<string, CurrencyCode>();
  const nppIds = pending.flatMap((entry) => (entry.nppId ? [entry.nppId] : []));
  if (nppIds.length > 0) {
    const nppDocs = await db
      .collection<{ _id: ObjectId; countryId?: string }>("npps")
      .find({ _id: { $in: nppIds } })
      .project({ countryId: 1, name: 1 })
      .toArray();
    for (const doc of nppDocs) {
      nppCurrencyById.set(
        doc._id.toString(),
        COUNTRY_CURRENCY_MAP[doc.countryId as keyof typeof COUNTRY_CURRENCY_MAP] ?? "USD"
      );
      holders.set(`npps:${doc._id}`, doc);
    }
  }
  for (const [collection, field] of [
    ["characters", "characterId"],
    ["imperialCharacters", "imperialCharacterId"],
  ] as const) {
    const ids = pending.flatMap((entry) => (entry[field] ? [entry[field]!] : []));
    if (!ids.length) continue;
    const rows = await db
      .collection(collection)
      .find({ _id: { $in: ids } })
      .project({ name: 1 })
      .toArray();
    for (const row of rows) holders.set(`${collection}:${row._id}`, row);
  }

  // The wallet credit is in the fund's native currency, so the pass needs one
  // rate per fund currency rather than one per fund.
  const currencies = [...new Set(funds.map((fund) => fund.anchorCurrencyCode))] as CurrencyCode[];
  const fxRateByCurrency = new Map<CurrencyCode, { rate: number; ok: boolean }>();
  if (forexEnabled && currencies.length > 0) {
    const rows = await db
      .collection<{ currencyCode: CurrencyCode; rate: number }>("exchangeRates")
      // Keep currencyCode: the map below is keyed by it, and a projection
      // without it returns rows that cannot be keyed.
      .find({ currencyCode: { $in: currencies } }, { projection: { currencyCode: 1, rate: 1 } })
      .toArray();
    const byCurrency = new Map(rows.map((row) => [row.currencyCode, row.rate]));
    for (const currency of currencies) {
      const rate = byCurrency.get(currency);
      fxRateByCurrency.set(
        currency,
        typeof rate === "number" && Number.isFinite(rate) && rate > 0
          ? { rate, ok: true }
          : { rate: 1, ok: false }
      );
    }
  }

  return {
    pendingByFundId,
    holders,
    nppCurrencyById,
    fxRateByCurrency,
    audit: await loadQueuedPayoutAuditContext(db),
  };
}

export async function processQueuedRedemptions(
  db: Db,
  fund: IndexFund,
  forexEnabled: boolean,
  currentTurn: number,
  recoveryAlreadyRun = false,
  budget: QueuedRedemptionClaimBudget = { claimsLeft: QUEUED_REDEMPTION_CLAIMS_PER_PASS },
  passContext?: QueuedRedemptionPassContext
): Promise<number> {
  const recovery = recoveryAlreadyRun
    ? { changed: false, recovered: 0 }
    : await recoverQueuedPayouts(db, fund._id, currentTurn);
  if (recovery.changed) {
    fund = (await getFundById(db, fund._id)) ?? fund;
  }
  const pending = passContext
    ? (passContext.pendingByFundId.get(String(fund._id)) ?? [])
    : await listPendingRedemptions(db, fund._id);
  if (pending.length === 0) return recovery.recovered;
  if (budget.claimsLeft <= 0) return recovery.recovered;
  // A caller driving the whole pass has already loaded everything the payout
  // paths need; a fund paying on its own loads the same context for itself.
  const context =
    passContext ?? (await prepareQueuedRedemptionPass(db, [fund], forexEnabled, pending));
  // Least recently touched first, so the entries a budgeted pass skipped are
  // served before the ones it just paid. Every claim, payout and restore stamps
  // updatedAt. The pro-rata share below still measures against the whole queue.
  const ordered = [...pending].sort(
    (a, b) =>
      new Date(a.updatedAt ?? a.createdAt).getTime() -
        new Date(b.updatedAt ?? b.createdAt).getTime() ||
      new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );

  // One batched holder lookup for the pass so each NPP
  // redemption below can be denominated in the NPP home currency (the
  // npp:<id>:<homeCurrency> snapshot key) without a per-entry read.
  const holders = context.holders;
  const nppCurrencyById = context.nppCurrencyById;
  /** Holder document key for a queue entry, matching the batched reads above. */
  const holderKeyOf = (
    entry: Pick<IndexFundRedemptionQueueEntry, "characterId" | "imperialCharacterId" | "nppId">
  ) =>
    entry.characterId
      ? `characters:${entry.characterId}`
      : entry.imperialCharacterId
        ? `imperialCharacters:${entry.imperialCharacterId}`
        : `npps:${entry.nppId}`;
  const holderOf = (
    entry: Pick<IndexFundRedemptionQueueEntry, "characterId" | "imperialCharacterId" | "nppId">
  ) => holders.get(holderKeyOf(entry));

  // Wallet credits are in the fund's native currency; the ₳ → native multiplier
  // is stamped on each queue entry at request time (entry.redeemFxRate, ticket
  // grandfather) - 1 for pre-fix legacy units, the fund rate for post-fix
  // units. Fund `cashAnchor` and NPP investment cash stay in ₳. We still gate on
  // rate availability so a momentary outage defers rather than risks a bad payout.
  if (forexEnabled) {
    const fxResult = context.fxRateByCurrency.get(fund.anchorCurrencyCode) ?? {
      rate: 1,
      ok: false,
    };
    if (!fxResult.ok) {
      // Rate unavailable - defer payouts to a later cycle.
      console.warn(
        `[indexfund-cron] deferring ${pending.length} queued redemption(s) for ${fund.slug}: FX rate for ${fund.anchorCurrencyCode} unavailable`
      );
      return 0;
    }
  }

  const audit = context.audit;
  let paid = recovery.recovered;
  let fundState = fund;
  let availableCash = fund.cashAnchor;
  // Thresholds for the bond-sale ledger rows below, loaded
  // at most once per redemption pass and only when a bond sale actually runs.
  let bondSaleThresholds: Awaited<ReturnType<typeof loadTxThresholds>> | undefined;

  // Units still unserved in this pass. Decremented as each entry is handled so
  // the share is measured against who is still waiting, not the original queue.
  const cancellations: AnyBulkWriteOperation<IndexFundRedemptionQueueEntry>[] = [];
  let unservedUnits = pending.reduce((sum, e) => sum + Math.max(0, e.units ?? 0), 0);

  // NPP payouts wait here and settle together (queuedPayoutBatch.ts). The
  // batch is flushed before anything that reads or moves fund cash on its own
  // (a liquidation sale or a single payout), when it is full, and at the end,
  // so every payout still lands in claim order against the same cash.
  let batch: PayoutBatchMember[] = [];
  const flushBatch = async () => {
    if (!batch.length) return;
    const members = batch;
    batch = [];
    paid += await settleQueuedPayoutBatch(db, {
      fund: fundState,
      members,
      turn: currentTurn,
      audit,
    });
    fundState = (await getFundById(db, fund._id)) ?? fundState;
    availableCash = fundState.cashAnchor;
  };

  for (const pendingEntry of ordered) {
    if (budget.claimsLeft <= 0) break;
    // A deleted holder cannot receive a payout. Burned-unit entries are cash
    // obligations with no recipient; cancel them once without moving money or
    // spending a payout claim. Legacy entries still own units and need manual
    // reconciliation, so keep them queued and warn instead.
    const owedUnits = remainingRedemptionUnits(pendingEntry);
    if (owedUnits > 0 && !holderOf(pendingEntry)) {
      if (pendingEntry.unitsBurnedAtRequest === true) {
        cancellations.push({
          updateOne: {
            filter: {
              _id: pendingEntry._id,
              status: pendingEntry.status,
              units: pendingEntry.units,
              paidAmountAnchor: pendingEntry.paidAmountAnchor,
              unitsBurnedAtRequest: true,
              pendingSettlementProjection: { $exists: false },
            },
            update: {
              $set: { status: "cancelled", cancelReason: "holder_missing", updatedAt: new Date() },
            },
          },
        });
      } else {
        console.warn(
          `[indexfund-cron] queued redemption ${pendingEntry._id} for ${fund.slug}: holder ${holderKeyOf(pendingEntry)} no longer exists; its units were not burned at request, so the row stays queued`
        );
      }
      unservedUnits = Math.max(0, unservedUnits - owedUnits);
      continue;
    }
    budget.claimsLeft--;
    // Fence this claim before liquidation or payout. Its frozen journal, not
    // current prices or an acknowledgement, determines every recovery.
    const claimId = randomUUID();
    const entry = await db
      .collection<IndexFundRedemptionQueueEntry>(FUND_REDEMPTION_QUEUE_COLLECTION)
      .findOneAndUpdate(
        {
          _id: pendingEntry._id,
          status: pendingEntry.status,
          units: pendingEntry.units,
          paidAmountAnchor: pendingEntry.paidAmountAnchor,
          pendingSettlementProjection: { $exists: false },
        },
        {
          $set: {
            status: "processing",
            settlementClaimId: claimId,
            processingTurn: currentTurn,
            processingStartedAt: new Date(),
            updatedAt: new Date(),
          },
          $unset: { payoutPlan: "" },
        },
        { returnDocument: "before" }
      );
    if (!entry) continue;
    const restoreQueueClaim = async () => {
      await db
        .collection<IndexFundRedemptionQueueEntry>(FUND_REDEMPTION_QUEUE_COLLECTION)
        .updateOne(
          { _id: entry._id, status: "processing", settlementClaimId: claimId },
          {
            $set: { status: entry.status, updatedAt: new Date() },
            $unset: { processingStartedAt: "", settlementClaimId: "", processingTurn: "" },
          }
        );
    };

    const unitsRemaining = remainingRedemptionUnits(entry);
    if (unitsRemaining <= 0) {
      await db
        .collection<IndexFundRedemptionQueueEntry>(FUND_REDEMPTION_QUEUE_COLLECTION)
        .updateOne(
          { _id: entry._id, status: "processing", settlementClaimId: claimId },
          {
            $set: { status: "paid", updatedAt: new Date() },
            $unset: { processingStartedAt: "", settlementClaimId: "", processingTurn: "" },
          }
        );
      continue;
    }

    // Forward pricing. The payout is struck at the fund's CURRENT NAV, never at
    // `requestedNavAnchor` (kept only as the record of what was quoted at
    // request). Honouring a locked price across many turns is what let one
    // GLB50 holder draw 2.46B out of a fund whose assets were falling under
    // them, because their claim stayed fixed in cash terms while everyone
    // else's shrank. A real open-end fund forward-prices for exactly this
    // reason: a redemption spanning several valuation points gets each point's
    // NAV, so the redeemer carries the market like every other holder.
    const redemptionNav = fundState.quotedNav;
    if (!Number.isFinite(redemptionNav) || redemptionNav <= 0) {
      await restoreQueueClaim();
      break;
    }

    const entryObligation = unitsRemaining * redemptionNav;
    if (availableCash < entryObligation) await flushBatch();
    if (availableCash < entryObligation && fundState.holdings.length > 0) {
      await sellFundHoldingsForRedemptionCash(db, fundState, entryObligation - availableCash, {
        note: "Queued redemption liquidity",
      });
      fundState = (await getFundById(db, fund._id)) ?? fundState;
      availableCash = fundState.cashAnchor;
    }
    // Bonds are the next line of liquidity: sold to the market pool at its
    // bid, as far as the pool can pay. The only line for a bond fund.
    if (availableCash < entryObligation) {
      bondSaleThresholds ??= await loadTxThresholds(db);
      const bondSale = await sellFundBondHoldingsForCash(
        db,
        fundState,
        entryObligation - availableCash,
        new Date(),
        { turn: currentTurn, thresholds: bondSaleThresholds }
      );
      if (bondSale.proceedsAnchor > 0) {
        fundState = (await getFundById(db, fund._id)) ?? fundState;
        availableCash = fundState.cashAnchor;
      }
    }

    if (availableCash <= 0) {
      await restoreQueueClaim();
      break;
    }

    // Pro-rata gate: never let one entry consume the book while others wait.
    // Measured against cash available now, after any liquidation above.
    const cashForThisEntry = proRataRedemptionCashShare({
      entryUnits: unitsRemaining,
      unservedUnits,
      availableCashAnchor: availableCash,
    });
    unservedUnits = Math.max(0, unservedUnits - unitsRemaining);

    const quote = quoteCashOnlyRedemption({
      quotedNav: redemptionNav,
      requestedUnits: unitsRemaining,
      allowFractionalUnits: fundState.mandate?.mode === "picked_stocks",
      cashAnchor: cashForThisEntry,
    });

    if (quote.redeemableUnits <= 0) {
      // This entry's pro-rata slice will not buy a whole unit. That says
      // nothing about the next entry, and the genuinely-out-of-cash case
      // already broke out above, so move on rather than starving the queue.
      await restoreQueueClaim();
      continue;
    }

    const paidAmount = quote.paidAmountAnchor;
    // Native-currency equivalent for personal wallet credits (₳ × blended rate).
    // Absent redeemFxRate = pre-fix queue row → credit rate-free (× 1), matching
    // what the holder was owed under the old symmetric-scale code (no windfall).
    const redeemFxRate = entry.redeemFxRate ?? 1;
    const paidNative = forexEnabled ? paidAmount * redeemFxRate : paidAmount;
    // A holder is paid in its own currency: NPP cash is already ₳, a personal
    // wallet is native. Resolved once here so the batched and single paths
    // credit the same balance.
    const credit = entry.characterId || entry.imperialCharacterId ? paidNative : paidAmount;
    const creditTarget = holderCreditTarget(fundState, entry, credit, forexEnabled);
    if (isBatchablePayout(entry)) {
      const holder = holderOf(entry);
      if (holder && creditTarget) {
        batch.push({
          entry,
          claimId,
          paidAmount,
          credit,
          creditTarget,
          units: quote.redeemableUnits,
          remainingUnits: quote.queuedUnits,
          nav: redemptionNav,
          holder,
          nppCurrency: nppCurrencyById.get(entry.nppId?.toString() ?? "") ?? "USD",
        });
        availableCash -= paidAmount;
        if (batch.length >= QUEUED_PAYOUT_BATCH_MAX) await flushBatch();
        continue;
      }
    }
    await flushBatch();
    const settled = await settleQueuedPayout(db, {
      fund: fundState,
      entry,
      claimId,
      paidAmount,
      paidNative,
      units: quote.redeemableUnits,
      remainingUnits: quote.queuedUnits,
      nav: redemptionNav,
      turn: currentTurn,
      forexEnabled,
      nppCurrency: nppCurrencyById.get(entry.nppId?.toString() ?? "") ?? "USD",
      audit,
      holder: holderOf(entry),
    });
    if (!settled) {
      await restoreQueueClaim();
      continue;
    }
    availableCash -= paidAmount;
    if (entry.unitsBurnedAtRequest !== true)
      fundState = { ...fundState, unitSupply: fundState.unitSupply - quote.redeemableUnits };

    paid++;
  }
  await flushBatch();

  if (cancellations.length > 0) {
    const cancelled = await db
      .collection<IndexFundRedemptionQueueEntry>(FUND_REDEMPTION_QUEUE_COLLECTION)
      .bulkWrite(cancellations);
    if (cancelled.matchedCount > 0)
      console.warn(
        `[indexfund-cron] cancelled queued redemptions for ${fund.slug}: ${cancelled.matchedCount} holder_missing claims with units burned at request`
      );
  }
  return paid;
}
