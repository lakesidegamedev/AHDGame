import { NextResponse } from "next/server";
import { getDb } from "@/lib/mongodb";
import { requireModerator } from "@/lib/api/requireModerator";
import { handleRouteError } from "@/lib/api/errors";
import type { ObjectId } from "mongodb";
import type { User, WikiPage } from "@/lib/db/types";
import { usersCollection } from "@/lib/db/repositories/users";
import { wikiPagesCollection } from "@/lib/db/repositories/wikiPages";
import { hasOpenPendingEdit } from "@/lib/wiki/rules/editFlow";

// GET /api/admin/wiki/review-queue — Returns all wiki pages with pending_review status awaiting moderation.
// Auth: requireModerator (admin or moderator)
// Errors: 403
export async function GET() {
  try {
    const auth = await requireModerator();
    if (!auth.ok) return auth.response;

    const db = await getDb();
    const wikiPages = wikiPagesCollection(db);

    const pending = await wikiPages
      .find({
        $or: [
          { status: "pending_review" },
          { pendingEdit: { $exists: true }, "pendingEdit.rejection": { $exists: false } },
        ],
      })
      .sort({ createdAt: -1 })
      .limit(50)
      .toArray();

    // Resolve submitter display names so the review UI doesn't need a second round trip.
    const submitterIds = Array.from(
      new Set(
        pending
          .map((p) => p.pendingEdit?.submittedBy ?? p.submittedBy)
          .filter((id): id is ObjectId => !!id)
      )
    );
    const users = submitterIds.length
      ? await usersCollection(db)
          .find({ _id: { $in: submitterIds } })
          .project<{ _id: ObjectId; username?: string; displayName?: string }>({
            username: 1,
            displayName: 1,
          })
          .toArray()
      : [];
    const nameById = new Map(
      users.map((u) => [u._id.toString(), u.displayName || u.username || "Unknown"])
    );

    // An edit to a live page shows the proposed text as the page and the live
    // text as the original, so the review screen can compare them.
    const enriched = pending.map((p) => {
      const edit = hasOpenPendingEdit(p) ? p.pendingEdit : undefined;
      const authorId = edit?.submittedBy ?? p.submittedBy;
      const { pendingEdit: _pendingEdit, ...rest } = p;
      void _pendingEdit;
      return {
        ...rest,
        ...(edit && {
          title: edit.title,
          description: edit.description,
          content: edit.content,
          tags: edit.tags,
          createdAt: edit.submittedAt,
          isEdit: true,
          originalTitle: p.title,
          originalDescription: p.description,
          originalContent: p.content,
        }),
        submitterName: authorId ? (nameById.get(authorId.toString()) ?? "Unknown") : "System",
      };
    });

    const response = NextResponse.json({ pending: enriched });
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  } catch (error) {
    return handleRouteError(error);
  }
}
