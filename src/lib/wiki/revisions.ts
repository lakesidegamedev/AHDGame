import type { Db, ObjectId } from "mongodb";
import { getWikiRevisionsCollection } from "@/lib/db/collections";
import type { WikiPage, WikiRevisionKind } from "@/lib/db/types";
import type { PageFields } from "@/lib/wiki/rules/editFlow";

interface RecordOpts {
  kind: WikiRevisionKind;
  fields: PageFields;
  authorId?: ObjectId;
  authorName?: string;
  moderatorId?: ObjectId;
  moderatorName?: string;
  note?: string;
  restoredFrom?: ObjectId;
  at: Date;
}

export async function recordWikiRevision(db: Db, slug: string, opts: RecordOpts) {
  const doc = {
    slug,
    kind: opts.kind,
    title: opts.fields.title,
    description: opts.fields.description,
    content: opts.fields.content,
    tags: opts.fields.tags,
    ...(opts.authorId && { authorId: opts.authorId }),
    ...(opts.authorName && { authorName: opts.authorName }),
    ...(opts.moderatorId && { moderatorId: opts.moderatorId }),
    ...(opts.moderatorName && { moderatorName: opts.moderatorName }),
    ...(opts.note && { note: opts.note }),
    ...(opts.restoredFrom && { restoredFrom: opts.restoredFrom }),
    createdAt: opts.at,
  };
  const result = await getWikiRevisionsCollection(db).insertOne(doc as never);
  return result.insertedId;
}

/**
 * A page that predates history has no revision of its live text. Store one
 * before the first change lands so there is something to compare against.
 */
export async function ensureBaselineRevision(db: Db, page: WikiPage, at: Date) {
  const revisions = getWikiRevisionsCollection(db);
  const existing = await revisions.findOne({ slug: page.slug }, { projection: { _id: 1 } });
  if (existing) return;
  await recordWikiRevision(db, page.slug, {
    kind: "baseline",
    fields: {
      title: page.title,
      description: page.description,
      content: page.content,
      tags: page.tags ?? [],
    },
    authorId: page.submittedBy,
    at: new Date(at.getTime() - 1),
  });
}

export function pageFieldsOf(page: WikiPage): PageFields {
  return {
    title: page.title,
    description: page.description,
    content: page.content,
    tags: page.tags ?? [],
    category: page.category,
    difficulty: page.difficulty,
  };
}
