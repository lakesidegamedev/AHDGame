import { getNavairBasingCollection } from "@/lib/db/collections/navairBasing";
import type { Migration } from "../types";

export const migration: Migration = {
  id: "2026-11-10-navair-basing-index",
  description: "Index active and offered bilateral basing agreements.",
  idempotent: true,
  async execute(db, ctx) {
    if (!ctx.dryRun)
      await getNavairBasingCollection(db).createIndex(
        { status: 1 },
        { name: "navairBasing_status" }
      );
    return {
      documentsScanned: 0,
      documentsUpdated: ctx.dryRun ? 0 : 1,
      notes: ["Created or verified the basing status index."],
    };
  },
};
