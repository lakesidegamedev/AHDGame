import { createPlannedIndexes, type IndexPlan } from "../indexPlans";
import type { Migration } from "../types";

const INDEXES: IndexPlan[] = [
  {
    // One cyber launch per attacker, target and turn, so two requests sent at
    // once cannot both be charged. Partial: only launch rows carry the key.
    // The seed creates the same index on fresh worlds.
    collection: "intelligenceOpLog",
    keys: { launchKey: 1 },
    options: {
      name: "intelligenceOpLog_launch_key",
      unique: true,
      partialFilterExpression: { launchKey: { $type: "string" } },
    },
  },
];

export const migration: Migration = {
  id: "2026-11-12-cyber-launch-key-index",
  description: "Unique index that allows one cyber launch per country pair and turn.",
  idempotent: true,
  execute: async (db, ctx) => createPlannedIndexes(db, ctx.dryRun, INDEXES),
};
