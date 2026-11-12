import { createPlannedIndexes, type IndexPlan } from "../indexPlans";
import type { Migration } from "../types";

const INDEXES: IndexPlan[] = [
  {
    // The demographics phase reads crises with population orders still pending.
    // Partial, so it holds only crises that raised one. The seed creates the
    // same index on fresh worlds.
    collection: "crises",
    keys: { "populationOrders.epochId": 1 },
    options: {
      name: "crises_population_orders_pending",
      partialFilterExpression: { "populationOrders.pending": true },
    },
  },
];

export const migration: Migration = {
  id: "2026-11-11-crisis-v2-population-order-indexes",
  description: "Index for population orders raised by Crisis v2 effects.",
  idempotent: true,
  execute: async (db, ctx) => createPlannedIndexes(db, ctx.dryRun, INDEXES),
};
