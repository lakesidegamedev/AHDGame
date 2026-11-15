import { createPlannedIndexes, type IndexPlan } from "../indexPlans";
import type { Migration } from "../types";
/**
 * Indexes for the two reads the index-fund turn phase does most.
 *
 * `bonds.holders.fundId` had no index; existing bonds indexes lead with fields
 * that do not help the `$elemMatch` on fundId. The query runs four times per
 * fund per turn, so it was a collection scan each time.
 *
 * `shareOrders.placerFundId` was also unindexed; the rebalance reads a fund's
 * open bids twice per turn.
 */

const INDEXES: IndexPlan[] = [
  {
    collection: "bonds",
    // Leading with the array field is what makes the $elemMatch selective; the
    // two flags then cut the matured/defaulted rows without fetching them.
    keys: { "holders.fundId": 1, matured: 1, defaulted: 1 },
    options: { name: "bonds_holders_fundId_active", sparse: true, background: true },
  },
  {
    collection: "shareOrders",
    keys: { placerFundId: 1, type: 1, status: 1 },
    options: { name: "share_orders_fund_open_bids", sparse: true, background: true },
  },
];

export const migration: Migration = {
  id: "2026-08-10-index-fund-phase-indexes",
  description:
    "Indexes for the index-fund phase hot reads: bond holdings by fund, and a fund's open share bids.",
  idempotent: true,
  execute: async (db, ctx) => createPlannedIndexes(db, ctx.dryRun, INDEXES),
};
