import type { Migration, MigrationResult } from "../types";
import { TELEMETRY_INDEXES } from "@/lib/admin/seed/indexes/telemetry";

const DUPLICATE_KEY = 11000;

/**
 * Unique series-coordinate indexes for `macroTelemetry` and `approvalTelemetry`
 * on live databases. Without them, every per-turn telemetry upsert scans the
 * whole collection, so cost grows each turn. Runs at startup because the cost
 * grows until the index exists. Create-only and idempotent. Duplicate
 * coordinates are reported, not thrown, so a unique build cannot block a
 * deployment; rerun with `--only <id> --force` after removing duplicates.
 */
export const migration: Migration = {
  id: "2026-09-30-long-horizon-telemetry-indexes",
  description: "Unique series-coordinate indexes for the long-horizon telemetry collections.",
  idempotent: true,
  execute: async (db, ctx): Promise<MigrationResult> => {
    const notes: string[] = [];
    let created = 0;
    for (const plan of TELEMETRY_INDEXES) {
      const label = `${plan.collection}.${plan.options.name}`;
      if (ctx.dryRun) {
        notes.push(`would create ${label}`);
        continue;
      }
      try {
        await db.collection(plan.collection).createIndex(plan.keys, plan.options);
        created += 1;
        notes.push(`created/verified ${label}`);
      } catch (error) {
        const code = (error as { code?: number }).code;
        const message = error instanceof Error ? error.message : String(error);
        if (code === DUPLICATE_KEY || message.includes("E11000")) {
          notes.push(`not created ${label}: duplicate series coordinates exist; ${message}`);
          continue;
        }
        throw error;
      }
    }
    return {
      documentsScanned: TELEMETRY_INDEXES.length,
      documentsUpdated: created,
      notes,
    };
  },
};
