/**
 * Fund NAV includes real equities, bonds, bid escrow and queued unit claims.
 * Depleted cash buffers release unused bids before selling bonds to funded dealers.
 * See recomputeNav and restoreFundCashBuffer.
 */
import type { AnyBulkWriteOperation, Db } from "mongodb";
import type { IndexFund, ShareOrder } from "@/lib/db/types";
import { INDEX_FUND_INITIAL_NAV, calculateBackingRatio } from "./unitAccounting";
import {
  computeHoldingsValueAnchor,
  INDEX_FUND_RESERVE_CASH_BUFFER_FRACTION,
} from "./fundAllocation";
import { FUND_COLLECTION, getFundById, listFundsByIds, updateFundNav } from "./fundQueries";
import { loadOpenOrdersEscrowByFundId, loadQueuedRedemptionUnitsByFundId } from "./fundValuation";
import { cancelFundShareOrder } from "./fundShareOrders";
import { sellFundBondHoldingsForCash } from "@/lib/bonds/sellFundBondUnits";
import { sumFundBondHoldingsValueAnchor } from "@/lib/bonds/fundBondHoldings";

export function recomputeNav(
  fund: IndexFund,
  options?: {
    bondPrincipalAnchor?: number;
    openOrdersEscrowAnchor?: number;
    /**
     * Units queued for redemption whose supply was already burned. They belong
     * in the DENOMINATOR: a queued holder is still a holder with a pro-rata
     * claim, not a creditor owed a fixed sum. Subtracting a cash liability
     * struck at the NAV locked when the redemption was requested is what
     * drained GLB50 - assets fell, the liability did not, and the entire
     * decline was pushed onto the holders who stayed until NAV hit zero.
     */
    queuedRedemptionUnits?: number;
  }
): number | null {
  const holdingsValueAnchor = computeHoldingsValueAnchor(fund);
  const bondPrincipalAnchor = options?.bondPrincipalAnchor ?? 0;
  const openOrdersEscrowAnchor = options?.openOrdersEscrowAnchor ?? 0;
  const queuedRedemptionUnits = Math.max(0, options?.queuedRedemptionUnits ?? 0);
  const totalBacking =
    fund.cashAnchor + holdingsValueAnchor + bondPrincipalAnchor + openOrdersEscrowAnchor;
  const totalUnits = fund.unitSupply + queuedRedemptionUnits;
  if (totalUnits <= 0) return INDEX_FUND_INITIAL_NAV;

  const nav = totalBacking / totalUnits;
  return Number.isFinite(nav) && nav > 0 ? nav : null;
}

/** Publish settled bond marks, including when a later reserve purchase fails. */
export async function refreshFundNavAfterBondDeployment(
  db: Db,
  fundId: IndexFund["_id"],
  bondPrincipalAnchor: number,
  openOrdersEscrowAnchor: number,
  queuedRedemptionUnits = 0
): Promise<void> {
  const fund = await getFundById(db, fundId);
  if (!fund) throw new Error("bond fund disappeared after deployment");
  const nav = recomputeNav(fund, {
    bondPrincipalAnchor,
    openOrdersEscrowAnchor,
    queuedRedemptionUnits,
  });
  if (nav === null) throw new Error("invalid NAV after bond deployment");
  const backing = calculateBackingRatio({
    cashAnchor: fund.cashAnchor,
    holdingsValueAnchor: computeHoldingsValueAnchor(fund),
    bondPrincipalAnchor,
    openOrdersEscrowAnchor,
    queuedRedemptionUnits,
    quotedNav: nav,
    unitSupply: fund.unitSupply,
  });
  await updateFundNav(db, fundId, { quotedNav: nav, backingRatio: backing.backingRatio });
}

/** One fund whose bond deployment this pass has to publish. */
export interface BondDeploymentNavRefresh {
  fund: IndexFund;
  bondPrincipalAnchor: number;
  openOrdersEscrowAnchor: number;
  queuedRedemptionUnits?: number;
}

/**
 * Publish every fund's NAV after the reserve pass in one read and one bulk
 * write. The per-fund helper above re-read the fund and wrote it back one fund
 * at a time; nothing else in the pass touches a fund's cash between its own
 * deployment and the end of the loop, so the books are the same.
 */
export async function refreshFundNavsAfterBondDeployment(
  db: Db,
  refreshes: BondDeploymentNavRefresh[]
): Promise<{
  updated: string[];
  failed: Array<{ fundId: IndexFund["_id"]; slug: string; message: string }>;
}> {
  const updated: string[] = [];
  const failed: Array<{ fundId: IndexFund["_id"]; slug: string; message: string }> = [];
  if (refreshes.length === 0) return { updated, failed };

  const funds = await listFundsByIds(
    db,
    refreshes.map((refresh) => refresh.fund._id)
  );
  const fundById = new Map(funds.map((fund) => [fund._id.toString(), fund]));
  const updates: AnyBulkWriteOperation<IndexFund>[] = [];
  const now = new Date();

  for (const refresh of refreshes) {
    const id = refresh.fund._id.toString();
    const fund = fundById.get(id);
    if (!fund) {
      failed.push({
        fundId: refresh.fund._id,
        slug: refresh.fund.slug,
        message: "bond fund disappeared after deployment",
      });
      continue;
    }
    const queuedRedemptionUnits = refresh.queuedRedemptionUnits ?? 0;
    const nav = recomputeNav(fund, {
      bondPrincipalAnchor: refresh.bondPrincipalAnchor,
      openOrdersEscrowAnchor: refresh.openOrdersEscrowAnchor,
      queuedRedemptionUnits,
    });
    if (nav === null) {
      failed.push({
        fundId: refresh.fund._id,
        slug: refresh.fund.slug,
        message: "invalid NAV after bond deployment",
      });
      continue;
    }
    const backing = calculateBackingRatio({
      cashAnchor: fund.cashAnchor,
      holdingsValueAnchor: computeHoldingsValueAnchor(fund),
      bondPrincipalAnchor: refresh.bondPrincipalAnchor,
      openOrdersEscrowAnchor: refresh.openOrdersEscrowAnchor,
      queuedRedemptionUnits,
      quotedNav: nav,
      unitSupply: fund.unitSupply,
    });
    updates.push({
      updateOne: {
        filter: { _id: fund._id },
        update: {
          $set: { quotedNav: nav, backingRatio: backing.backingRatio, updatedAt: now },
        },
      },
    });
    updated.push(id);
  }

  if (updates.length > 0) {
    await db.collection<IndexFund>(FUND_COLLECTION).bulkWrite(updates);
  }
  return { updated, failed };
}

/** Restore cash depleted by redemptions or older reserve purchases using real bond sales. */
export async function restoreFundCashBuffer(
  db: Db,
  fund: IndexFund,
  bondPrincipalAnchor: number,
  exchangeRates: Partial<Record<string, number>>,
  currentTurn: number
): Promise<{ fund: IndexFund; bondPrincipalAnchor: number }> {
  let workingFund = fund;
  let backing = fund.cashAnchor + computeHoldingsValueAnchor(fund) + bondPrincipalAnchor;
  let shortfall = Math.max(0, backing * INDEX_FUND_RESERVE_CASH_BUFFER_FRACTION - fund.cashAnchor);
  if (shortfall <= 0.01) return { fund, bondPrincipalAnchor };
  // Committed bids still back NAV but are not spendable allocation reserves.
  // Release them before paying a dealer spread to restore the cash buffer.
  const bids = await db
    .collection<ShareOrder>("shareOrders")
    .find({ placerFundId: fund._id, type: "buy", status: "open" })
    .toArray();
  let released = 0;
  for (const bid of bids) {
    if (released * (1 - INDEX_FUND_RESERVE_CASH_BUFFER_FRACTION) >= shortfall) break;
    await cancelFundShareOrder(db, bid._id, currentTurn, { fund });
    released += bid.escrowAnchor ?? 0;
  }
  if (released > 0) {
    workingFund = (await getFundById(db, fund._id)) ?? fund;
    backing =
      workingFund.cashAnchor + computeHoldingsValueAnchor(workingFund) + bondPrincipalAnchor;
    shortfall = Math.max(
      0,
      backing * INDEX_FUND_RESERVE_CASH_BUFFER_FRACTION - workingFund.cashAnchor
    );
  }
  if (shortfall <= 0.01 || bondPrincipalAnchor <= 0)
    return { fund: workingFund, bondPrincipalAnchor };
  const sale = await sellFundBondHoldingsForCash(db, workingFund, shortfall, new Date(), {
    turn: currentTurn,
  });
  if (sale.proceedsAnchor <= 0) return { fund: workingFund, bondPrincipalAnchor };
  const updatedBonds = await sumFundBondHoldingsValueAnchor(db, fund, exchangeRates);
  const [escrow, queue] = await Promise.all([
    loadOpenOrdersEscrowByFundId(db, [fund._id]),
    loadQueuedRedemptionUnitsByFundId(db, [fund._id]),
  ]);
  await refreshFundNavAfterBondDeployment(
    db,
    fund._id,
    updatedBonds,
    escrow.get(String(fund._id)) ?? 0,
    queue.get(String(fund._id)) ?? 0
  );
  const updated = await getFundById(db, fund._id);
  if (!updated) throw new Error("Fund disappeared after cash buffer restoration");
  return { fund: updated, bondPrincipalAnchor: updatedBonds };
}
