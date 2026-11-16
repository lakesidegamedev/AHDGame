import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { withNoStore } from "@/lib/api/withNoStore";
import { getDb } from "@/lib/mongodb";
import { getAuthUser } from "@/lib/auth";
import { errorResponse, handleRouteError } from "@/lib/api/errors";
import { checkWikiDisabled } from "@/lib/api/wikiGuard";
import { getWikiRevisionsCollection } from "@/lib/db/collections";
import { wikiPagesCollection } from "@/lib/db/repositories/wikiPages";

interface RouteContext {
  params: Promise<{ slug: string }>;
}

// GET /api/wiki/[slug]/history: lists the versions of a page that went live, newest first, without their text.
// Auth: the page author, moderators and admins; others get 404
// Errors: 403, 404
async function handleGET(_request: Request, context: RouteContext) {
  try {
    const blocked = await checkWikiDisabled();
    if (blocked) return blocked;

    const user = await getAuthUser();
    if (!user) return errorResponse(404, "Not found");

    const { slug } = await context.params;
    const db = await getDb();
    const page = await wikiPagesCollection(db).findOne(
      { slug },
      { projection: { submittedBy: 1 } }
    );
    const isStaff = user.isAdmin === true || user.role === "moderator";
    const isAuthor = !!page?.submittedBy && page.submittedBy.equals(new ObjectId(user.userId));
    if (!page || (!isStaff && !isAuthor)) return errorResponse(404, "Not found");

    const revisions = await getWikiRevisionsCollection(db)
      .find({ slug, kind: { $ne: "rejected" } })
      .project({ content: 0, description: 0, tags: 0 })
      .sort({ createdAt: -1 })
      .limit(100)
      .toArray();

    return NextResponse.json({
      canRestore: isStaff,
      revisions: revisions.map((r) => ({
        id: String(r._id),
        kind: r.kind,
        title: r.title,
        authorName: r.authorName ?? null,
        moderatorName: r.moderatorName ?? null,
        note: r.note ?? null,
        createdAt: r.createdAt.toISOString(),
      })),
    });
  } catch (error) {
    return handleRouteError(error);
  }
}

export const GET = withNoStore(handleGET);
