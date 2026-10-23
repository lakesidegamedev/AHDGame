import { createPlannedIndexes, type IndexPlan } from "../indexPlans";
import type { Migration } from "../types";
const INDEXES: IndexPlan[] = [
  {
    collection: "unionLeaderVotes",
    keys: { unionId: 1, voterCharacterId: 1 },
    options: {
      name: "unique_union_leader_vote_per_organizer",
      unique: true,
      background: true,
    },
  },
  {
    collection: "unionOrganizers",
    keys: { unionId: 1, characterId: 1 },
    options: {
      name: "unique_union_organizer_per_character",
      unique: true,
      background: true,
    },
  },
];

export const migration: Migration = {
  id: "2026-07-04-union-leadership-indexes",
  description: "Unique indexes for union organizer and leadership-vote collections.",
  idempotent: true,
  execute: async (db, ctx) => createPlannedIndexes(db, ctx.dryRun, INDEXES),
};
