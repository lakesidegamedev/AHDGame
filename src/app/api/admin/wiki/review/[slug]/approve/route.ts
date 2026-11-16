import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getDb } from "@/lib/mongodb";
import { requireModerator } from "@/lib/api/requireModerator";
import { parseJsonBody } from "@/lib/api/validate";
import { handleRouteError, notFound, errorResponse } from "@/lib/api/errors";
import { approveWikiPageSchema } from "@/lib/api/schemas/wiki";
import { notifySubmitterOfWikiDecision } from "@/lib/wiki/reviewNotifications";
import { createModAuditLog } from "@/lib/modAuditLog";
import type { User, WikiPage, EditHistoryEntry } from "@/lib/db/types";
import { ObjectId } from "mongodb";
import { usersCollection } from "@/lib/db/repositories/users";
import { wikiPagesCollection } from "@/lib/db/repositories/wikiPages";
import { hasOpenPendingEdit, mergeApproval } from "@/lib/wiki/rules/editFlow";
import { ensureBaselineRevision, pageFieldsOf, recordWikiRevision } from "@/lib/wiki/revisions";

interface RouteContext {
  params: Promise<{ slug: string }>;
}

// POST /api/admin/wiki/review/[slug]/approve — Approves a pending wiki page submission, optionally applying editorial edits before publishing.
// Auth: requireModerator (admin or moderator)
// Errors: 400, 403, 404
export async function POST(request: Request, context: RouteContext) {
  try {
    const auth = await requireModerator();
    if (!auth.ok) return auth.response;

    const { slug } = await context.params;

    const parsed = await parseJsonBody(request, approveWikiPageSchema);
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
    const proposed = pendingEdit ?? pageFieldsOf(existing);
    const merged = mergeApproval(
      {
        title: proposed.title,
        description: proposed.description,
        content: proposed.content,
        tags: proposed.tags,
        category: proposed.category,
        difficulty: proposed.difficulty,
      },
      parsed.data
    );

    const updateData: Partial<WikiPage> = {
      status: "published",
      reviewedBy: reviewerId,
      updatedAt: now,
      title: merged.title,
      description: merged.description,
      content: merged.content,
      tags: merged.tags,
      ...(merged.category !== undefined && { category: merged.category }),
      ...(merged.difficulty !== undefined && { difficulty: merged.difficulty }),
    };

    const editEntries: EditHistoryEntry[] = [
      { userId: reviewerId, timestamp: now, action: "approved", note: parsed.data.note },
    ];
    const editedFields = (
      [
        ["content", parsed.data.editedContent],
        ["title", parsed.data.editedTitle],
        ["description", parsed.data.editedDescription],
        ["tags", parsed.data.editedTags],
      ] as const
    )
      .filter(([, value]) => value !== undefined)
      .map(([name]) => name);

    if (editedFields.length > 0) {
      editEntries.push({
        userId: reviewerId,
        timestamp: now,
        action: "edited",
        note: `Content modified during approval: ${editedFields.join(", ")}`,
      });
    }

    updateData.editHistory = [...(existing.editHistory || []), ...editEntries];

    // Pages from before history have no stored copy of what is live now.
    if (existing.status === "published") await ensureBaselineRevision(db, existing, now);

    await wikiPages.updateOne(
      { slug },
      { $set: updateData, ...(pendingEdit && { $unset: { pendingEdit: "" } }) }
    );
    const updated = await wikiPages.findOne({ slug });

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
        title: updated?.title ?? existing.title,
        decision: "approved",
      }).catch((err) => console.error("[wiki] approve notify failed:", err));
    }

    await recordWikiRevision(db, slug, {
      kind: "approved",
      fields: merged,
      authorId: pendingEdit?.submittedBy ?? existing.submittedBy,
      authorName: submitterUsername,
      moderatorId: reviewerId,
      moderatorName: auth.user.username,
      note: parsed.data.note,
      at: now,
    });

    await createModAuditLog({
      moderatorId: auth.user.userId,
      moderatorName: auth.user.username,
      action: "approve_wiki_page",
      targetUserId: existing.submittedBy?.toString(),
      targetUsername: submitterUsername,
      details: `${slug}: ${updated?.title ?? existing.title}`,
    });
    revalidatePath(`/wiki/${slug}`);
    const response = NextResponse.json({ success: true, page: updated });
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  } catch (error) {
    return handleRouteError(error);
  }
}
