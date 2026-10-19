import { createPlannedIndexes, type IndexPlan } from "../indexPlans";
import type { Migration } from "../types";
const INDEXES: IndexPlan[] = [
  {
    // The turn sweep selects every vote due to close, so it has to be an
    // index scan rather than a collection scan of all campaigns.
    collection: "bargainingCampaigns",
    keys: { "ratification.status": 1, "ratification.closesAtTurn": 1 },
    options: { name: "bargaining_campaigns_ratification_due", background: true },
  },
  {
    // One ballot per organizer per offer. The command upserts on this exact
    // key, so uniqueness here is what stops a double-submit counting twice.
    collection: "bargainingRatificationBallots",
    keys: { campaignId: 1, offerRevision: 1, voterCharacterId: 1 },
    options: { name: "unique_ratification_ballot_per_organizer", unique: true, background: true },
  },
];

export const migration: Migration = {
  id: "2026-08-11-ratification-ballot-indexes",
  description: "Indexes for settlement ratification votes and their member ballots.",
  idempotent: true,
  execute: async (db, ctx) => createPlannedIndexes(db, ctx.dryRun, INDEXES),
};
