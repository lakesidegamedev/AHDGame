import type { Migration, MigrationResult } from "../types";
import { runBackfillPoliticalLegislationTypes } from "../../../../scripts/migrations/2026-08-19-backfill-political-legislation-types";
import { migration as regionalDefaultLaws } from "./2026-08-31-regional-default-laws-newgen";

/**
 * Germany, Japan and China now carry the later-era laws (2027 to 2050 bands)
 * in the one law book, after their books were first backfilled. Each needs its
 * `legislationTypes` document and a level-0 default row per region.
 *
 * Insert-only: existing documents are never rewritten. The old-generation
 * later-era types and any enacted rows for them stay as they are.
 */
async function backfillModernEraBook(
  db: Parameters<Migration["execute"]>[0],
  dryRun: boolean
): Promise<MigrationResult> {
  const types = await runBackfillPoliticalLegislationTypes(db, { dryRun });
  const defaults = await regionalDefaultLaws.execute(db, { dryRun });
  return {
    documentsScanned: (types.documentsScanned ?? 0) + (defaults.documentsScanned ?? 0),
    documentsInserted: (types.documentsInserted ?? 0) + (defaults.documentsInserted ?? 0),
    notes: [...(types.notes ?? []), ...(defaults.notes ?? [])],
  };
}

export const migration: Migration = {
  id: "2026-11-13-modern-era-book-backfill",
  description:
    "Insert the legislation types and level-0 regional default rows for Germany's, Japan's and China's later-era laws into worlds seeded before those laws joined the book.",
  idempotent: true,
  execute: (db, ctx) => backfillModernEraBook(db, ctx.dryRun),
};
