import type { Migration } from "../types";
import { indexFundCommandsCollection } from "@/lib/db/repositories/indexFundCommands";
import type { Document } from "mongodb";

export const migration: Migration = {
  id: "2026-10-12-bank-fund-subscriptions",
  description: "Index next-turn subscription receipts without changing existing fund rights.",
  idempotent: true,
  async execute(db) {
    await indexFundCommandsCollection<Document>(db).createIndex(
      { "subscription.status": 1, "subscription.dueTurn": 1, "subscription.fundId": 1 },
      { name: "indexFundCommands_due_subscriptions" }
    );
    await indexFundCommandsCollection<Document>(db).createIndex(
      { "subscription.fundId": 1, "subscription.characterId": 1, "subscription.status": 1 },
      { name: "indexFundCommands_viewer_subscriptions" }
    );
    return {};
  },
};
