import type { Migration } from "../types";
import { unionOrganizersCollection } from "@/lib/db/repositories/unionOrganizers";
import type { Document } from "mongodb";

export const migration: Migration = {
  id: "2026-09-29-union-prosecution-bar-index",
  description: "Index active union prosecution bars by character and turn.",
  idempotent: true,
  async execute(db, ctx) {
    if (!ctx.dryRun) {
      await unionOrganizersCollection<Document>(db).createIndex(
        { characterId: 1, barredUntilTurn: 1 },
        { name: "union_prosecution_bar_by_character", background: true }
      );
    }
    return {
      documentsScanned: 0,
      documentsUpdated: ctx.dryRun ? 0 : 1,
      notes: [
        `${ctx.dryRun ? "would create" : "created/verified"} union_prosecution_bar_by_character`,
      ],
    };
  },
};
