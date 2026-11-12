import { createPlannedIndexes, type IndexPlan } from "../indexPlans";
import type { Migration } from "../types";

const INDEXES: IndexPlan[] = [
  {
    // The scar pass reads crises whose scars have not finished healing. Partial,
    // so it holds only crises that ever laid a scar. The seed creates the same
    // index on fresh worlds.
    collection: "crises",
    keys: { scarsHealUntil: 1 },
    options: {
      name: "crises_scars_healing",
      partialFilterExpression: { scarsHealUntil: { $exists: true } },
    },
  },
];

export const migration: Migration = {
  id: "2026-11-10-crisis-v2-consequence-indexes",
  description: "Index for the Crisis v2 scar healing pass.",
  idempotent: true,
  execute: async (db, ctx) => createPlannedIndexes(db, ctx.dryRun, INDEXES),
};
