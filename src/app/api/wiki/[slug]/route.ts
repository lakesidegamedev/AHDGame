import { NextResponse } from "next/server";
import { withNoStore } from "@/lib/api/withNoStore";
import { revalidatePath } from "next/cache";
import { getDb } from "@/lib/mongodb";
import { getAuthUser } from "@/lib/auth"; // Optional auth — intentionally uses getAuthUser()
import { requireAuthWithCharacter } from "@/lib/api/requireAuth";
import { parseJsonBody } from "@/lib/api/validate";
import { checkRateLimit, rateLimitResponse } from "@/lib/api/rateLimit";
import { updateWikiPageSchema } from "@/lib/api/schemas/wiki";
import { handleRouteError, notFound, errorResponse } from "@/lib/api/errors";
import { checkWikiDisabled } from "@/lib/api/wikiGuard";
import { notifyModeratorsOfWikiSubmission } from "@/lib/wiki/reviewNotifications";
import type { User, WikiPage } from "@/lib/db/types";
import { ObjectId } from "mongodb";
import { usersCollection } from "@/lib/db/repositories/users";
import { wikiPagesCollection } from "@/lib/db/repositories/wikiPages";
import { planAuthorEdit } from "@/lib/wiki/rules/editFlow";
import { pageFieldsOf } from "@/lib/wiki/revisions";

function definedOnly<T extends object>(obj: T): Partial<T> {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined)) as Partial<T>;
}

function withoutPendingEdit(page: WikiPage): WikiPage {
  const { pendingEdit: _pendingEdit, ...rest } = page;
  void _pendingEdit;
  return rest as WikiPage;
}

interface RouteContext {
  params: Promise<{ slug: string }>;
}

// GET /api/wiki/[slug] — Returns a single wiki page by slug; drafts and pending pages are only visible to their author or admins.
// Auth: public; blocked when wiki is disabled
// Errors: 403, 404
async function handleGET(request: Request, context: RouteContext) {
  try {
    const blocked = await checkWikiDisabled();
    if (blocked) return blocked;

    const { slug } = await context.params;
    const user = await getAuthUser();

    const db = await getDb();
    const wikiPages = wikiPagesCollection(db);

    const page = await wikiPages.findOne({ slug });
    if (!page) {
      return NextResponse.json(notFound().toJson(), { status: 404 });
    }

    // Private pages are admin-only
    if (page.private && !user?.isAdmin) {
      return NextResponse.json(notFound().toJson(), { status: 404 });
    }

    // Check permissions
    if (page.status === "published") {
      // Anyone can view published (unless private, handled above)
      const canEdit =
        user &&
        page.submittedBy &&
        (user.isAdmin || page.submittedBy.equals(new ObjectId(user.userId)));
      return NextResponse.json({
        page: canEdit ? page : withoutPendingEdit(page),
        canEdit: !!canEdit,
      });
    }

    // Drafts/pending only visible to author or admin
    if (!user) {
      return NextResponse.json(notFound().toJson(), { status: 404 });
    }

    const isAuthor = page.submittedBy && page.submittedBy.equals(new ObjectId(user.userId));
    const isAdmin = user.isAdmin;

    if (!isAuthor && !isAdmin) {
      return NextResponse.json(notFound().toJson(), { status: 404 });
    }

    return NextResponse.json({ page, canEdit: isAuthor || isAdmin });
  } catch (error) {
    return handleRouteError(error);
  }
}

export const GET = withNoStore(handleGET);

// PATCH /api/wiki/[slug] — Author edits their own page. Publication status,
// featured flag, and admin-only toggles are ignored; edits to a published page
// send it back to `pending_review`. Admins use /api/admin/wiki/[slug] instead.
// Auth: requireAuthWithCharacter; blocked when wiki is disabled
// Errors: 400, 401, 403, 404, 429
export async function PATCH(request: Request, context: RouteContext) {
  try {
    const blocked = await checkWikiDisabled();
    if (blocked) return blocked;

    const auth = await requireAuthWithCharacter();
    if (!auth.ok) return auth.response;
    const user = auth.user;

    const rateLimit = checkRateLimit(`api/wiki/[slug]:${user.userId}`, 30, 60_000);
    if (!rateLimit.ok) return rateLimitResponse(rateLimit.retryAfter);

    const { slug } = await context.params;
    const parsed = await parseJsonBody(request, updateWikiPageSchema);
    if (!parsed.success) {
      return errorResponse(parsed.status, parsed.error);
    }

    const db = await getDb();
    const wikiPages = wikiPagesCollection(db);
    const page = await wikiPages.findOne({ slug });
    if (!page) {
      return NextResponse.json(notFound().toJson(), { status: 404 });
    }

    const userId = new ObjectId(user.userId);
    const isAuthor = !!page.submittedBy && page.submittedBy.equals(userId);
    if (!isAuthor) {
      return errorResponse(403, "Forbidden");
    }

    // Authors cannot set status/featured/private themselves.
    const {
      status: _ignoredStatus,
      featured: _ignoredFeatured,
      private: _ignoredPrivate,
      ...authorEditable
    } = parsed.data;
    void _ignoredStatus;
    void _ignoredFeatured;
    void _ignoredPrivate;

    const now = new Date();
    const plan = planAuthorEdit(
      { ...pageFieldsOf(page), status: page.status },
      {
        title: authorEditable.title,
        description: authorEditable.description,
        content: authorEditable.content,
        tags: authorEditable.tags,
        category: authorEditable.category,
        difficulty: authorEditable.difficulty,
      }
    );
    const wasPublished = plan.kind === "hold-pending";

    // A live page keeps its approved text until a moderator decides. The edit
    // waits in `pendingEdit`, so a failed or slow review never hides the page.
    const update: Record<string, unknown> =
      plan.kind === "hold-pending"
        ? { pendingEdit: { ...plan.edit, submittedBy: userId, submittedAt: now } }
        : {
            ...definedOnly(plan.fields),
            ...(authorEditable.templateType !== undefined && {
              templateType: authorEditable.templateType,
            }),
            status: plan.nextStatus,
            updatedAt: now,
          };

    await wikiPages.updateOne(
      { _id: page._id },
      {
        $set: update,
        $push: {
          editHistory: {
            userId,
            timestamp: now,
            action: "edited",
          },
        },
      }
    );

    const updated = await wikiPages.findOne({ _id: page._id });

    // Anything that lands in the review queue needs the moderator ping,
    // otherwise the submission sits silent until someone happens to check.
    if (wasPublished || page.status === "draft") {
      const submitter = await usersCollection(db).findOne(
        { _id: userId },
        { projection: { username: 1, displayName: 1 } }
      );
      notifyModeratorsOfWikiSubmission({
        slug,
        title: updated?.title ?? page.title,
        submitterName: submitter?.displayName || submitter?.username || "a player",
      }).catch((err) => console.error("[wiki] edit notify failed:", err));
    }

    revalidatePath(`/wiki/${slug}`);
    const response = NextResponse.json({
      success: true,
      page: updated,
      slug: updated?.slug,
      pendingReview: true,
    });
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  } catch (error) {
    return handleRouteError(error);
  }
}
