import { NextResponse } from "next/server";
import { getDb } from "@/lib/mongodb";
import { requireModerator } from "@/lib/api/requireModerator";
import { parseJsonBody } from "@/lib/api/validate";
import { handleRouteError, notFound, errorResponse } from "@/lib/api/errors";
import { rejectWikiPageSchema } from "@/lib/api/schemas/wiki";
import { notifySubmitterOfWikiDecision } from "@/lib/wiki/reviewNotifications";
import { createModAuditLog } from "@/lib/modAuditLog";
import type { User, WikiPage } from "@/lib/db/types";
import { ObjectId } from "mongodb";
import { usersCollection } from "@/lib/db/repositories/users";
import { wikiPagesCollection } from "@/lib/db/repositories/wikiPages";
import { hasOpenPendingEdit } from "@/lib/wiki/rules/editFlow";
import { pageFieldsOf, recordWikiRevision } from "@/lib/wiki/revisions";

interface RouteContext {
  params: Promise<{ slug: string }>;
}

// POST /api/admin/wiki/review/[slug]/reject - Rejects a pending wiki page submission and returns it to draft status with a reason.
// Auth: requireModerator (admin or moderator)
// Errors: 400, 403, 404
export async function POST(request: Request, context: RouteContext) {
  try {
    const auth = await requireModerator();
    if (!auth.ok) return auth.response;

    const { slug } = await context.params;

    const parsed = await parseJsonBody(request, rejectWikiPageSchema);
    if (!parsed.success) {
      return errorResponse(parsed.status, parsed.error);
    }

    const db = await getDb();
    const wikiPages = wikiPagesCollection(db);

    const existing = await wikiPages.findOne({ slug });
    if (!existing) {
      return NextResponse.json(notFound().toJson(), { status: 404 });
    }

    const pendingEdit = hasOpenPendingEdit(existing) ? existing.pendingEdit : undefined;
    if (existing.status !== "pending_review" && !pendingEdit) {
      return errorResponse(400, "Page is not pending review");
    }

    const now = new Date();
    const reviewerId = new ObjectId(auth.user.userId);
    const history = [
      ...(existing.editHistory || []),
      {
        userId: reviewerId,
        timestamp: now,
        action: "rejected" as const,
        note: parsed.data.reason,
      },
    ];
    if (pendingEdit) {
      // The live version stays published; the declined edit stays with the
      // author so they can revise it instead of retyping.
      await wikiPages.updateOne(
        { slug },
        {
          $set: {
            "pendingEdit.rejection": { reason: parsed.data.reason, by: reviewerId, at: now },
            editHistory: history,
          },
        }
      );
    } else {
      await wikiPages.updateOne(
        { slug },
        { $set: { status: "draft", updatedAt: now, editHistory: history } }
      );
    }

    let submitterUsername: string | undefined;
    if (existing.submittedBy) {
      const submitter = await usersCollection(db).findOne(
        { _id: existing.submittedBy },
        { projection: { username: 1, displayName: 1 } }
      );
      submitterUsername = submitter?.displayName || submitter?.username;

      notifySubmitterOfWikiDecision({
        submitterId: existing.submittedBy,
        slug,
        title: existing.title,
        decision: "rejected",
        reason: parsed.data.reason,
      }).catch((err) => console.error("[wiki] reject notify failed:", err));
    }

    const rejected = pendingEdit ?? pageFieldsOf(existing);
    await recordWikiRevision(db, slug, {
      kind: "rejected",
      fields: {
        title: rejected.title,
        description: rejected.description,
        content: rejected.content,
        tags: rejected.tags ?? [],
      },
      authorId: pendingEdit?.submittedBy ?? existing.submittedBy,
      authorName: submitterUsername,
      moderatorId: reviewerId,
      moderatorName: auth.user.username,
      note: parsed.data.reason,
      at: now,
    });

    await createModAuditLog({
      moderatorId: auth.user.userId,
      moderatorName: auth.user.username,
      action: "reject_wiki_page",
      targetUserId: existing.submittedBy?.toString(),
      targetUsername: submitterUsername,
      details: `${slug}: ${existing.title} - ${parsed.data.reason}`,
    });

    const response = NextResponse.json({ success: true });
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  } catch (error) {
    return handleRouteError(error);
  }
}
