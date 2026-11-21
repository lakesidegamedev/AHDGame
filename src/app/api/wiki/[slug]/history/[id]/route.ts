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
  params: Promise<{ slug: string; id: string }>;
}

// GET /api/wiki/[slug]/history/[id]: returns the full text of one stored version, for comparing two versions.
// Auth: the page author, moderators and admins; others get 404
// Errors: 400, 403, 404
async function handleGET(_request: Request, context: RouteContext) {
  try {
    const blocked = await checkWikiDisabled();
    if (blocked) return blocked;

    const user = await getAuthUser();
    if (!user) return errorResponse(404, "Not found");

    const { slug, id } = await context.params;
    if (!/^[a-f0-9]{24}$/.test(id)) return errorResponse(400, "Invalid revision id");

    const db = await getDb();
    const page = await wikiPagesCollection(db).findOne(
      { slug },
      { projection: { submittedBy: 1 } }
    );
    const isStaff = user.isAdmin === true || user.role === "moderator";
    const isAuthor = !!page?.submittedBy && page.submittedBy.equals(new ObjectId(user.userId));
    if (!page || (!isStaff && !isAuthor)) return errorResponse(404, "Not found");

    const revision = await getWikiRevisionsCollection(db).findOne({
      _id: new ObjectId(id),
      slug,
      kind: { $ne: "rejected" },
    });
    if (!revision) return errorResponse(404, "Not found");

    return NextResponse.json({
      revision: {
        id: String(revision._id),
        kind: revision.kind,
        title: revision.title,
        description: revision.description,
        content: revision.content,
        tags: revision.tags,
        createdAt: revision.createdAt.toISOString(),
      },
    });
  } catch (error) {
    return handleRouteError(error);
  }
}

export const GET = withNoStore(handleGET);
