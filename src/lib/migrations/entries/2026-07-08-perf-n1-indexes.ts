import { createPlannedIndexes, type IndexPlan } from "../indexPlans";
import type { Migration } from "../types";
const INDEXES: IndexPlan[] = [
  {
    // Nationalization eligibility checks for defaulted, unmatured bonds per
    // corporation on every candidate pass; bond payoff, restructure, and
    // hostile-takeover paths filter the same way. Existing bonds indexes lead
    // with holders.characterId / issuerType, so these lookups collection-scan.
    collection: "bonds",
    keys: { corporationId: 1, matured: 1, defaulted: 1 },
    options: { name: "bonds_corporation_matured_defaulted", background: true },
  },
];

export const migration: Migration = {
  id: "2026-07-08-perf-n1-indexes",
  description:
    "Compound bonds index (corporationId, matured, defaulted) for nationalization eligibility and bond payoff paths (#2817).",
  idempotent: true,
  execute: async (db, ctx) => createPlannedIndexes(db, ctx.dryRun, INDEXES),
};
