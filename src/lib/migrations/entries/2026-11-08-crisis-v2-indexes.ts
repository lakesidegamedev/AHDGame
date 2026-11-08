import { createPlannedIndexes, type IndexPlan } from "../indexPlans";
import type { Migration } from "../types";

const INDEXES: IndexPlan[] = [
  {
    // The Crisis v2 turn phase's per-turn read. Partial on the instance, so the
    // index holds nothing until a crisis carries one. The seed creates the same
    // index on fresh worlds.
    collection: "crises",
    keys: { status: 1, "v2.definitionId": 1 },
    options: {
      name: "crises_v2_active",
      partialFilterExpression: { "v2.definitionId": { $exists: true } },
    },
  },
  {
    collection: "crisisLeverUses",
    keys: { crisisId: 1, appliedTurn: 1 },
    options: { name: "crisis_lever_uses_pending" },
  },
  {
    collection: "crisisDetectorStreaks",
    keys: { detectorId: 1 },
    options: { name: "crisis_detector_streaks_detector" },
  },
];

export const migration: Migration = {
  id: "2026-11-08-crisis-v2-indexes",
  description: "Indexes for the Crisis v2 turn phase: active v2 crises and pending lever uses.",
  idempotent: true,
  execute: async (db, ctx) => createPlannedIndexes(db, ctx.dryRun, INDEXES),
};
