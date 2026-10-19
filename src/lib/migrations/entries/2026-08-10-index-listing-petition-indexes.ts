import { createPlannedIndexes, type IndexPlan } from "../indexPlans";
import type { Migration } from "../types";
/**
 * A7 part 2 indexes for `indexListingPetitions`.
 *
 * The uniqueness index is the important one: one open petition per corporation.
 * Without it two concurrent filings both pass the "already petitioning" read and
 * the corporation pays two contributions for one hearing.
 *
 * It is PARTIAL on `status: "pending"` rather than plain unique, because a
 * corporation is expected to accumulate decided petitions over a long game and
 * a full uniqueness constraint would refuse the second one it ever files.
 */

const INDEXES: IndexPlan[] = [
  {
    collection: "indexListingPetitions",
    keys: { corporationId: 1 },
    options: {
      name: "unique_pending_index_listing_petition_per_corp",
      unique: true,
      partialFilterExpression: { status: "pending" },
      background: true,
    },
  },
  {
    // The listing screen's hot read: every corporation with a live waiver.
    collection: "indexListingPetitions",
    keys: { status: 1, waiverUntilTurn: 1 },
    options: { name: "index_listing_petitions_active_waivers", background: true },
  },
  {
    // The deadline sweep, and the committee's own inbox.
    collection: "indexListingPetitions",
    keys: { status: 1, deadlineAtTurn: 1 },
    options: { name: "index_listing_petitions_due", background: true },
  },
  {
    collection: "indexListingPetitions",
    keys: { countryId: 1, status: 1, deadlineAtTurn: 1 },
    options: { name: "index_listing_petitions_country_inbox", background: true },
  },
];

export const migration: Migration = {
  id: "2026-08-10-index-listing-petition-indexes",
  description: "Uniqueness and read indexes for A7 index-committee listing petitions.",
  idempotent: true,
  execute: async (db, ctx) => createPlannedIndexes(db, ctx.dryRun, INDEXES),
};
