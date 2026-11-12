import type { Migration, MigrationResult } from "../types";
import { runBackfillPoliticalLegislationTypes } from "../../../../scripts/migrations/2026-08-19-backfill-political-legislation-types";
import { migration as regionalDefaultLaws } from "./2026-08-31-regional-default-laws-newgen";

/**
 * China joined the one law book after the live world was seeded. Readers of
 * the book resolve a law through its `legislationTypes` document and each
 * region's level-0 default row, so both are inserted for China's laws.
 *
 * Insert-only: existing documents are never rewritten, so a world keeps its
 * admin edits and any drifted state. China's old-generation enacted laws and
 * political boards are untouched; a new world seeds the whole book on reset.
 */
async function backfillChineseLawBook(
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
  id: "2026-11-12-cn-law-book-backfill",
  description:
    "Insert the legislation types and level-0 regional default rows for China's law book into worlds seeded before it joined the one law book.",
  idempotent: true,
  execute: (db, ctx) => backfillChineseLawBook(db, ctx.dryRun),
};
