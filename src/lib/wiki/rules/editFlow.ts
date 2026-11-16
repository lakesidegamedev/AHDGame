/**
 * Rules for how an author edit moves through review. Plain data in and out;
 * the routes own the database, clock and notifications.
 */
import type { WikiPageDifficulty, WikiPageStatus } from "@/lib/db/types/wikiPage";

export interface PageFields {
  title: string;
  description: string;
  content: string;
  tags: string[];
  category?: string;
  difficulty?: WikiPageDifficulty;
}

export type AuthorEditPlan =
  /** Live page: keep it published and park the edit beside it. */
  | { kind: "hold-pending"; edit: PageFields }
  /** Not live yet: write the fields in place and (re)enter review. */
  | { kind: "write-in-place"; fields: Partial<PageFields>; nextStatus: WikiPageStatus };

export function planAuthorEdit(
  current: PageFields & { status?: WikiPageStatus },
  patch: Partial<PageFields>
): AuthorEditPlan {
  if (current.status === "published") {
    return {
      kind: "hold-pending",
      edit: {
        title: patch.title ?? current.title,
        description: patch.description ?? current.description,
        content: patch.content ?? current.content,
        tags: patch.tags ?? current.tags,
        category: patch.category ?? current.category,
        difficulty: patch.difficulty ?? current.difficulty,
      },
    };
  }
  return { kind: "write-in-place", fields: patch, nextStatus: "pending_review" };
}

/** Fields a moderator can adjust while approving; each overrides the author's text. */
export function mergeApproval(
  proposed: PageFields,
  overrides: {
    editedTitle?: string;
    editedDescription?: string;
    editedContent?: string;
    editedTags?: string[];
  }
): PageFields {
  return {
    ...proposed,
    title: overrides.editedTitle ?? proposed.title,
    description: overrides.editedDescription ?? proposed.description,
    content: overrides.editedContent ?? proposed.content,
    tags: overrides.editedTags ?? proposed.tags,
  };
}

/** True when a page has an author edit that still needs a decision. */
export function hasOpenPendingEdit(page: {
  pendingEdit?: { rejection?: unknown } | null;
}): boolean {
  return !!page.pendingEdit && !page.pendingEdit.rejection;
}
