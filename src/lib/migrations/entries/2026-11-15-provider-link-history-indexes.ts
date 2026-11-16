import type { Migration } from "../types";
import { providerLinkHistoryCollection } from "@/lib/db/repositories/providerLinkHistory";

export const migration: Migration = {
  id: "2026-11-15-provider-link-history-indexes",
  description: "Create the providerLinkHistory collection indexes (additive, no data rewrite)",
  idempotent: true,
  async execute(db, ctx) {
    if (ctx.dryRun) return { notes: ["Would create providerLinkHistory indexes."] };
    const history = providerLinkHistoryCollection(db);
    await history.createIndex({ userId: 1, at: -1 }, { name: "providerLinkHistory_user_at" });
    await history.createIndex(
      { subjectHash: 1, provider: 1 },
      { name: "providerLinkHistory_subjectHash_provider" }
    );
    return { notes: ["Created or verified providerLinkHistory indexes."] };
  },
};
