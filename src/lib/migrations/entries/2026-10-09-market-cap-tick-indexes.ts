import type { Db } from "mongodb";
import type { Migration } from "../types";
import { marketCapTicksCollection } from "@/lib/db/repositories/marketCapTicks";
import type { Document } from "mongodb";

export const migration: Migration = {
  id: "2026-10-09-market-cap-tick-indexes",
  description: "Index for the 15-minute market cap chart: marketCapTicks by exchange and slot.",
  idempotent: true,
  async execute(db: Db, ctx) {
    if (!ctx.dryRun) {
      await marketCapTicksCollection<Document>(db).createIndex(
        { exchange: 1, at: 1 },
        { name: "marketCapTicks_exchange_at", background: true }
      );
      await marketCapTicksCollection<Document>(db).createIndex(
        { exchange: 1, turn: 1, at: 1 },
        { name: "marketCapTicks_exchange_turn_at", background: true }
      );
    }
    return {
      documentsScanned: 0,
      documentsUpdated: ctx.dryRun ? 0 : 2,
      notes: [
        `${ctx.dryRun ? "would create" : "created/verified"} marketCapTicks.marketCapTicks_exchange_at and marketCapTicks_exchange_turn_at`,
      ],
    };
  },
};
