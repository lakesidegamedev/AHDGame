import type { ObjectId } from "mongodb";

export const WIKI_REVISION_KINDS = [
  "baseline",
  "approved",
  "restored",
  "moderator_edit",
  "rejected",
] as const;

export type WikiRevisionKind = (typeof WIKI_REVISION_KINDS)[number];

/**
 * One decision or live version of a wiki page. Kinds other than `rejected`
 * are versions that went live; `rejected` keeps the declined text so the
 * review log can show what was turned down. Stored in `wikiRevisions`.
 */
export interface WikiRevision {
  _id: ObjectId;
  slug: string;
  kind: WikiRevisionKind;
  title: string;
  description: string;
  content: string;
  tags: string[];
  authorId?: ObjectId;
  authorName?: string;
  moderatorId?: ObjectId;
  moderatorName?: string;
  /** Moderator note on an approval, or the reason on a rejection. */
  note?: string;
  restoredFrom?: ObjectId;
  createdAt: Date;
}
