import { createPlannedIndexes, type IndexPlan } from "../indexPlans";
import type { Migration } from "../types";
const INDEXES: IndexPlan[] = [
  {
    collection: "eventInstances",
    keys: { scope: 1, scopeId: 1, status: 1 },
    options: { name: "eventInstances_scope_scopeId_status", background: true },
  },
  {
    collection: "eventInstances",
    keys: { status: 1, expiresAtRealtimeMs: 1 },
    options: { name: "eventInstances_status_expiresAtRealtimeMs", background: true },
  },
  {
    collection: "eventDefinitions",
    keys: { status: 1, kind: 1 },
    options: { name: "eventDefinitions_status_kind", background: true },
  },
  {
    collection: "eventCooldownLedger",
    keys: { scope: 1, scopeId: 1 },
    options: { name: "eventCooldownLedger_scope_scopeId", background: true },
  },
];

export const migration: Migration = {
  id: "2026-06-09-event-substrate-indexes",
  description: "Indexes for eventInstances, eventDefinitions, and eventCooldownLedger.",
  idempotent: true,
  execute: async (db, ctx) => createPlannedIndexes(db, ctx.dryRun, INDEXES),
};
