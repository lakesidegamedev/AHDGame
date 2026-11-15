import type { Db } from "mongodb";
import type { Migration, MigrationResult } from "../types";

const RETIRED_COLLECTIONS = ["siteTrafficPageviews", "codeQualitySnapshots"] as const;

/**
 * Nothing reads or writes these collections any more: page views go to the
 * hosted analytics tool and the code quality tab is gone. Dropping them also
 * drops their TTL indexes.
 */
export const migration: Migration = {
  id: "2026-11-15-drop-unread-telemetry-collections",
  description: "Drop the retired siteTrafficPageviews and codeQualitySnapshots collections.",
  idempotent: true,
  async execute(db: Db, ctx): Promise<MigrationResult> {
    const existing = new Set(
      (await db.listCollections({}, { nameOnly: true }).toArray()).map((c) => c.name)
    );
    const notes: string[] = [];
    for (const name of RETIRED_COLLECTIONS) {
      if (!existing.has(name)) {
        notes.push(`${name}: not present`);
        continue;
      }
      if (ctx.dryRun) {
        notes.push(`${name}: would drop`);
        continue;
      }
      await db.dropCollection(name);
      notes.push(`${name}: dropped`);
    }
    return { notes };
  },
};
