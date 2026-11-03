import { createPlannedIndexes, type IndexPlan } from "../indexPlans";
import type { Migration } from "../types";

const INDEXES: IndexPlan[] = [
  {
    // Settlement recovery and the credit-line, arrears and coupon turn paths
    // ask for the unfinished moves under one key prefix. Leading with status
    // bounds that to the small unfinished set and keeps `_id` in the index, so
    // the probe is one covered range instead of a walk of every move ever
    // written under the prefix. The banking seed creates the same index.
    collection: "bankMoneyMoves",
    keys: { status: 1, _id: 1 },
    options: { name: "bankMoneyMoves_status_id" },
  },
  {
    // The bond pool's working-balance probe sums live sovereign face maturing
    // within the next issuance interval.
    collection: "bonds",
    keys: { matured: 1, maturityTurn: 1 },
    options: { name: "bonds_matured_maturityTurn" },
  },
  {
    // The commodity phase reads a year of new debt issuance and the bond turn
    // reads this turn's at-par issues; both walked every bond ever issued.
    collection: "bonds",
    keys: { issuedAtTurn: 1 },
    options: { name: "bonds_issuedAtTurn" },
  },
];

export const migration: Migration = {
  id: "2026-10-26-turn-growth-indexes",
  description:
    "Indexes that keep turn-phase bond and money-move probes proportional to live work instead of history.",
  idempotent: true,
  execute: async (db, ctx) => createPlannedIndexes(db, ctx.dryRun, INDEXES),
};
