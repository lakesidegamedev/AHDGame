import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { z } from "zod";
import { getDb } from "@/lib/mongodb";
import { requireModerator } from "@/lib/api/requireModerator";
import { errorResponse, handleRouteError } from "@/lib/api/errors";
import { getWikiRevisionsCollection } from "@/lib/db/collections";

const querySchema = z.object({
  moderator: z
    .string()
    .regex(/^[a-f0-9]{24}$/)
    .optional(),
  slug: z
    .string()
    .regex(/^[a-z0-9-]{1,100}$/)
    .optional(),
  decision: z.enum(["approved", "rejected"]).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

// GET /api/admin/wiki/review-log: who approved or rejected which page and when, with the moderator note.
// Auth: requireModerator (admin or moderator)
// Errors: 400, 403
export async function GET(request: Request) {
  try {
    const auth = await requireModerator();
    if (!auth.ok) return auth.response;

    const params = Object.fromEntries(new URL(request.url).searchParams);
    const parsed = querySchema.safeParse(params);
    if (!parsed.success) return errorResponse(400, "Invalid filter");
    const { moderator, slug, decision, limit } = parsed.data;

    const db = await getDb();
    const revisions = getWikiRevisionsCollection(db);
    const filter = {
      kind: decision ? decision : { $in: ["approved", "rejected"] as ("approved" | "rejected")[] },
      ...(moderator && { moderatorId: new ObjectId(moderator) }),
      ...(slug && { slug }),
    };

    const [rows, moderatorRows] = await Promise.all([
      revisions
        .find(filter)
        .project({ content: 0, description: 0, tags: 0 })
        .sort({ createdAt: -1 })
        .limit(limit)
        .toArray(),
      revisions
        .aggregate<{ _id: ObjectId; name: string }>([
          { $match: { kind: { $in: ["approved", "rejected"] }, moderatorId: { $exists: true } } },
          { $group: { _id: "$moderatorId", name: { $last: "$moderatorName" } } },
          { $sort: { name: 1 } },
          { $limit: 200 },
        ])
        .toArray(),
    ]);

    const response = NextResponse.json({
      entries: rows.map((r) => ({
        id: String(r._id),
        slug: r.slug,
        title: r.title,
        decision: r.kind,
        moderatorName: r.moderatorName ?? "Unknown",
        authorName: r.authorName ?? null,
        note: r.note ?? null,
        createdAt: r.createdAt.toISOString(),
      })),
      moderators: moderatorRows.map((m) => ({ id: String(m._id), name: m.name ?? "Unknown" })),
    });
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  } catch (error) {
    return handleRouteError(error);
  }
}
