import { createPlannedIndexes, type IndexPlan } from "../indexPlans";
import type { Migration } from "../types";
const INDEXES: IndexPlan[] = [
  {
    // Prevents duplicate pledges and hardens a double-pledge race condition:
    // only one commitment per (crisis, sending country) can exist.
    collection: "crisisAidCommitments",
    keys: { crisisId: 1, senderCountryId: 1 },
    options: {
      name: "crisisAidCommitments_crisis_sender_unique",
      unique: true,
      background: true,
    },
  },
  {
    // One commitment per bill — enforces the 1:1 bill→commitment relationship.
    collection: "crisisAidCommitments",
    keys: { billId: 1 },
    options: {
      name: "crisisAidCommitments_billId_unique",
      unique: true,
      background: true,
    },
  },
  {
    // Status + penalty-expiry sweep index: used by processCrisisAidResolutions
    // and reverseCrisisAidPenalties to find pending/expired commitments cheaply.
    collection: "crisisAidCommitments",
    keys: { status: 1, approvalPenaltyExpiresTurn: 1 },
    options: {
      name: "crisisAidCommitments_status_penaltyExpiry",
      background: true,
    },
  },
];

export const migration: Migration = {
  id: "2026-06-21-crisis-aid-indexes",
  description:
    "Unique pledge guard (crisis+sender) and bill-id uniqueness + sweep index for crisisAidCommitments.",
  idempotent: true,
  execute: async (db, ctx) => createPlannedIndexes(db, ctx.dryRun, INDEXES),
};
