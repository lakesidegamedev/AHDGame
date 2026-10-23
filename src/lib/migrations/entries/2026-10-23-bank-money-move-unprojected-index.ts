import { createPlannedIndexes, type IndexPlan } from "../indexPlans";
import type { Migration } from "../types";

const INDEXES: IndexPlan[] = [
  {
    // The banking recovery queue's second branch: applied moves whose
    // projections have not completed (`unfinishedSettlementFilter`). Read
    // every turn, and the status index cannot narrow it, so without this each
    // turn fetched every applied move to find none (73s on the live turn).
    // Partial on the projection-bearing applied rows, keyed so a missing
    // `projectionsCompletedAt` is a single null bound. The banking seed
    // creates the same index on fresh worlds.
    collection: "bankMoneyMoves",
    keys: { projectionsCompletedAt: 1, createdAt: 1 },
    options: {
      name: "bankMoneyMoves_unprojected_applied",
      partialFilterExpression: { status: "applied", "projections.0": { $exists: true } },
    },
  },
];

export const migration: Migration = {
  id: "2026-10-23-bank-money-move-unprojected-index",
  description:
    "Partial index for applied banking money moves whose projections have not completed, the per-turn banking recovery queue.",
  idempotent: true,
  execute: async (db, ctx) => createPlannedIndexes(db, ctx.dryRun, INDEXES),
};
