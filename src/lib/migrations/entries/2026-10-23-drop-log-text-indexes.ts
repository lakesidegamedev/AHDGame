import type { Migration } from "../types";

/**
 * Text indexes on the two per-turn money/audit logs. No query uses `$text` on
 * either collection (admin search uses regex, which a text index cannot
 * serve), so they only cost writes: one index entry per name token on every
 * row, on the two collections the turn writes most (about 100k rows a turn),
 * plus about 600 MB of index on the live world.
 */
export const DROPPED_LOG_TEXT_INDEXES = [
  { collection: "actionAuditLog", name: "actionAuditLog_text_search" },
  { collection: "financialTxLog", name: "financialTxLog_text_search" },
] as const;

export const migration: Migration = {
  id: "2026-10-23-drop-log-text-indexes",
  description:
    "Drop the unused text indexes on actionAuditLog and financialTxLog. Nothing queries them with $text; they only add index writes to every turn.",
  idempotent: true,
  async execute(db, ctx) {
    const notes: string[] = [];
    let dropped = 0;
    for (const index of DROPPED_LOG_TEXT_INDEXES) {
      const label = `${index.collection}.${index.name}`;
      if (ctx.dryRun) {
        notes.push(`would drop ${label} if present`);
        continue;
      }
      try {
        await db.collection(index.collection).dropIndex(index.name);
        dropped += 1;
        notes.push(`dropped ${label}`);
      } catch (error) {
        // IndexNotFound (27) is a fresh world or a second run. NamespaceNotFound
        // (26) is a world that never wrote the collection. Anything else is real.
        const code = (error as { code?: unknown; codeName?: unknown }) ?? {};
        if (
          code.code === 27 ||
          code.codeName === "IndexNotFound" ||
          code.code === 26 ||
          code.codeName === "NamespaceNotFound"
        ) {
          notes.push(`${label} not present`);
        } else {
          throw error;
        }
      }
    }
    return { documentsScanned: DROPPED_LOG_TEXT_INDEXES.length, documentsUpdated: dropped, notes };
  },
};
