import { createPlannedIndexes, type IndexPlan } from "../indexPlans";
import type { Migration } from "../types";

const INDEXES: IndexPlan[] = [
  {
    collection: "crisisLeverUses",
    keys: { crisisId: 1, leverId: 1, holderId: 1, submittedTurn: 1 },
    options: { name: "crisis_lever_uses_claim", unique: true },
  },
  {
    collection: "bills",
    keys: { "crisisEmergency.crisisId": 1 },
    options: {
      name: "bills_crisis_emergency",
      partialFilterExpression: { "crisisEmergency.crisisId": { $exists: true } },
    },
  },
];

export const migration: Migration = {
  id: "2026-11-09-crisis-v2-lever-indexes",
  description: "Unique lever-pull claim and the emergency-bill sweep index for Crisis v2.",
  idempotent: true,
  execute: async (db, ctx) => createPlannedIndexes(db, ctx.dryRun, INDEXES),
};
