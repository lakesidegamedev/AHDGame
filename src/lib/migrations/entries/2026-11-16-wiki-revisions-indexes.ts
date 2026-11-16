import type { Migration } from "../types";
import { getWikiRevisionsCollection } from "@/lib/db/collections";

export const migration: Migration = {
  id: "2026-11-16-wiki-revisions-indexes",
  description: "Create the wikiRevisions collection indexes (additive, no data rewrite)",
  idempotent: true,
  async execute(db, ctx) {
    if (ctx.dryRun) return { notes: ["Would create wikiRevisions indexes."] };
    const revisions = getWikiRevisionsCollection(db);
    await revisions.createIndex(
      { slug: 1, createdAt: -1 },
      { name: "wikiRevisions_slug_createdAt" }
    );
    await revisions.createIndex(
      { kind: 1, createdAt: -1 },
      { name: "wikiRevisions_kind_createdAt" }
    );
    return { notes: ["Created or verified wikiRevisions indexes."] };
  },
};
