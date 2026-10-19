import { createPlannedIndexes, type IndexPlan } from "../indexPlans";
import type { Migration } from "../types";
const INDEXES: IndexPlan[] = [
  {
    // The repair queue: every banking money movement that started and did not
    // finish. It is the operator's only view of a hole in the books, and it
    // reads oldest-first, so without this it is a growing collection scan and
    // the tool gets slower every turn the world runs.
    collection: "bankMoneyMoves",
    keys: { status: 1, kind: 1, createdAt: 1 },
    options: { name: "bankMoneyMoves_status_kind_createdAt", background: true },
  },
  {
    // "What did this turn move" is the first question after a turn that
    // reports a conservation warning.
    collection: "bankMoneyMoves",
    keys: { turn: -1 },
    options: { name: "bankMoneyMoves_turn_desc", background: true },
  },
  {
    // The dead-bank loan servicer scans corporations for failed/revoked
    // charters every banking turn; without this it is a full collection scan
    // of `corporations` per turn.
    collection: "corporations",
    keys: { "bankCharter.status": 1 },
    options: { name: "corporations_bankCharter_status", background: true, sparse: true },
  },
];

export const migration: Migration = {
  id: "2026-08-18-bank-money-move-indexes",
  description:
    "Indexes for the banking money-movement claim records and their repair queue. The seed module covers a fresh bootstrap; this covers a world that is already running.",
  idempotent: true,
  execute: async (db, ctx) => createPlannedIndexes(db, ctx.dryRun, INDEXES),
};
