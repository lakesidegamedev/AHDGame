import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { ObjectId } from "mongodb";
import { getDb } from "@/lib/mongodb";
import { requireModerator } from "@/lib/api/requireModerator";
import { parseJsonBody } from "@/lib/api/validate";
import { errorResponse, handleRouteError, notFound } from "@/lib/api/errors";
import { restoreWikiRevisionSchema } from "@/lib/api/schemas/wiki";
import { getWikiRevisionsCollection } from "@/lib/db/collections";
import { wikiPagesCollection } from "@/lib/db/repositories/wikiPages";
import { createModAuditLog } from "@/lib/modAuditLog";
import { ensureBaselineRevision, recordWikiRevision } from "@/lib/wiki/revisions";

interface RouteContext {
  params: Promise<{ slug: string }>;
}

// POST /api/admin/wiki/[slug]/restore: puts an earlier version back live and records it as a new version.
// Auth: requireModerator (admin or moderator)
// Errors: 400, 403, 404
export async function POST(request: Request, context: RouteContext) {
  try {
    const auth = await requireModerator();
    if (!auth.ok) return auth.response;

    const { slug } = await context.params;
    const parsed = await parseJsonBody(request, restoreWikiRevisionSchema);
    if (!parsed.success) return errorResponse(parsed.status, parsed.error);

    const db = await getDb();
    const wikiPages = wikiPagesCollection(db);
    const page = await wikiPages.findOne({ slug });
    if (!page) return NextResponse.json(notFound().toJson(), { status: 404 });

    const revisionId = new ObjectId(parsed.data.revisionId);
    const revision = await getWikiRevisionsCollection(db).findOne({
      _id: revisionId,
      slug,
      kind: { $ne: "rejected" },
    });
    if (!revision) return NextResponse.json(notFound().toJson(), { status: 404 });

    const now = new Date();
    const moderatorId = new ObjectId(auth.user.userId);
    if (page.status === "published") await ensureBaselineRevision(db, page, now);

    await wikiPages.updateOne(
      { slug },
      {
        $set: {
          title: revision.title,
          description: revision.description,
          content: revision.content,
          tags: revision.tags,
          status: "published",
          reviewedBy: moderatorId,
          updatedAt: now,
        },
        $push: {
          editHistory: {
            userId: moderatorId,
            timestamp: now,
            action: "edited",
            note: "Restored an earlier version",
          },
        },
      }
    );

    await recordWikiRevision(db, slug, {
      kind: "restored",
      fields: {
        title: revision.title,
        description: revision.description,
        content: revision.content,
        tags: revision.tags,
      },
      moderatorId,
      moderatorName: auth.user.username,
      restoredFrom: revision._id,
      note: `Restored the version from ${revision.createdAt.toISOString()}`,
      at: now,
    });

    await createModAuditLog({
      moderatorId: auth.user.userId,
      moderatorName: auth.user.username,
      action: "restore_wiki_page",
      targetUserId: page.submittedBy?.toString(),
      details: `${slug}: restored version ${revision._id.toString()}`,
    });

    revalidatePath(`/wiki/${slug}`);
    const response = NextResponse.json({ success: true });
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  } catch (error) {
    return handleRouteError(error);
  }
}
