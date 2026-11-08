import type { Db, UpdateFilter } from "mongodb";
import { ObjectId } from "mongodb";

import type { IndexFund, IndexFundHolding } from "@/lib/db/types";
import { computeHoldingsValueAnchor } from "@/lib/indexFunds/fundAllocation";
import {
  insertFundTransaction,
  insertFundTransactionsBulk,
  updateFundHoldings,
} from "@/lib/indexFunds/fundQueries";

export interface DeadHoldingWriteOffResult {
  /** Holdings removed at zero because the corporation no longer exists. */
  writtenOffCount: number;
  writtenOffValueAnchor: number;
  /** Holdings the fund still cannot sell, but whose corporation is alive. */
  unsellableCount: number;
  unsellableValueAnchor: number;
}

const EMPTY: DeadHoldingWriteOffResult = {
  writtenOffCount: 0,
  writtenOffValueAnchor: 0,
  unsellableCount: 0,
  unsellableValueAnchor: 0,
};

/**
 * Remove holdings in dead corporations that the sale path silently refused.
 *
 * Divestment is only implemented as a sale, and
 * `sellFundHoldingsForRedemptionCash` skips holdings whose corporation
 * document is gone. A dead corp left its position in the book forever:
 * flagged every rebalance, never sold, still marked at `lastValueAnchor`,
 * inflating NAV as stale backing.
 *
 * A dead corporation's shares are worth zero, so the correct exit is a
 * write-off, not a sale. Holdings whose corporation is still alive are only
 * counted and reported: zeroing a live position would destroy real holder
 * value to fix a bookkeeping problem.
 */
export async function writeOffDeadConstituentHoldings(
  db: Db,
  fund: IndexFund,
  flagged: IndexFundHolding[]
): Promise<DeadHoldingWriteOffResult> {
  if (flagged.length === 0) return EMPTY;

  // Only holdings the sale left behind. Anything it managed to sell is gone
  // from `fund.holdings` already, and must not be written off on top.
  const flaggedIds = new Set(flagged.map((h) => h.corporationId.toString()));
  const stillHeld = fund.holdings.filter(
    (h) => flaggedIds.has(h.corporationId.toString()) && h.shares > 0
  );
  if (stillHeld.length === 0) return EMPTY;

  const liveIds = new Set(
    (
      await db
        .collection("corporations")
        .find({ _id: { $in: stillHeld.map((h) => h.corporationId) } }, { projection: { _id: 1 } })
        .toArray()
    ).map((c) => String(c._id))
  );

  const dead = stillHeld.filter((h) => !liveIds.has(h.corporationId.toString()));
  const unsellable = stillHeld.filter((h) => liveIds.has(h.corporationId.toString()));

  const result: DeadHoldingWriteOffResult = {
    writtenOffCount: dead.length,
    writtenOffValueAnchor: computeHoldingsValueAnchor({ holdings: dead }),
    unsellableCount: unsellable.length,
    unsellableValueAnchor: computeHoldingsValueAnchor({ holdings: unsellable }),
  };
  if (dead.length === 0) return result;

  const deadIds = new Set(dead.map((h) => h.corporationId.toString()));
  const remaining = fund.holdings.filter((h) => !deadIds.has(h.corporationId.toString()));

  await updateFundHoldings(db, fund._id, remaining);

  await insertFundTransaction(db, {
    fundId: fund._id,
    kind: "holding_writeoff",
    navAnchor: fund.quotedNav,
    // Negative: this is backing leaving the fund, not proceeds arriving.
    amountAnchor: -result.writtenOffValueAnchor,
    note:
      `Wrote off ${dead.length} holding(s) in dissolved corporations at zero. ` +
      `No buyer exists for a corporation that no longer exists, so the position ` +
      `could not be sold and was carried at a stale mark.`,
    createdAt: new Date(),
  });

  return result;
}

/** Test seam: the ids a write-off would touch, without writing. */
export function selectDeadHoldingIds(
  holdings: IndexFundHolding[],
  liveCorporationIds: Iterable<ObjectId | string>
): ObjectId[] {
  const live = new Set(Array.from(liveCorporationIds, (id) => String(id)));
  return holdings
    .filter((h) => h.shares > 0 && !live.has(h.corporationId.toString()))
    .map((h) => h.corporationId);
}

/**
 * Write off every index-fund holding in a corporation being wound down,
 * at wind-down time.
 *
 * `payFundShareholderRows` only pulls a fund's holding when the fund is paid
 * a positive slice, and `allocateShareholderPool` emits no fund rows when the
 * shareholder pool is empty, so an insolvent wind-down would otherwise leave
 * holdings in every fund at `lastValueAnchor`, overstating NAV until the next
 * rebalance writes them off. Call after any payout and before deleting the
 * corporation: paid funds no longer hold it, so no double-count.
 */
export async function writeOffFundHoldingsInDissolvedCorporation(
  db: Db,
  corporationId: ObjectId,
  now: Date
): Promise<{ fundCount: number; writtenOffValueAnchor: number }> {
  const funds = await db
    .collection<IndexFund>("indexFunds")
    .find(
      { "holdings.corporationId": corporationId },
      { projection: { _id: 1, quotedNav: 1, holdings: 1 } }
    )
    .toArray();

  let writtenOffValueAnchor = 0;
  const fundIds: ObjectId[] = [];
  const transactions: Parameters<typeof insertFundTransactionsBulk>[1] = [];
  for (const fund of funds) {
    const held = (fund.holdings ?? []).filter((h) => h.corporationId.equals(corporationId));
    if (held.length === 0) continue;
    const value = computeHoldingsValueAnchor({ holdings: held });
    fundIds.push(fund._id);
    writtenOffValueAnchor += value;
    if (held.some((h) => h.shares > 0)) {
      transactions.push({
        fundId: fund._id,
        kind: "holding_writeoff",
        navAnchor: fund.quotedNav,
        amountAnchor: -value,
        note:
          `Wrote off a holding in a corporation wound down with nothing left ` +
          `for shareholders. Its shares are worth zero.`,
        createdAt: now,
      });
    }
  }

  if (fundIds.length > 0) {
    await db.collection<IndexFund>("indexFunds").updateMany({ _id: { $in: fundIds } }, {
      $pull: { holdings: { corporationId } },
      $set: { updatedAt: now },
    } as unknown as UpdateFilter<IndexFund>);
  }
  await insertFundTransactionsBulk(db, transactions);
  const fundCount = fundIds.length;
  return { fundCount, writtenOffValueAnchor };
}
