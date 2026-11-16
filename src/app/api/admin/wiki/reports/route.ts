import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { z } from "zod";
import { getDb } from "@/lib/mongodb";
import { requireModerator } from "@/lib/api/requireModerator";
import { errorResponse, handleRouteError } from "@/lib/api/errors";
import { parseJsonBody } from "@/lib/api/validate";
import { getWikiReportsCollection } from "@/lib/db/collections";

const resolveSchema = z.object({
  id: z.string().regex(/^[a-f0-9]{24}$/, "Invalid report id"),
  resolved: z.boolean(),
});

// GET /api/admin/wiki/reports: player wiki reports, newest first, with the page quote and note.
// Auth: requireModerator (admin or moderator)
// Errors: 403
export async function GET() {
  try {
    const auth = await requireModerator();
    if (!auth.ok) return auth.response;

    const db = await getDb();
    const reports = await getWikiReportsCollection(db)
      .find({})
      .project({ ip: 0, userId: 0, relayAttempted: 0 })
      .sort({ createdAt: -1 })
      .limit(500)
      .toArray();

    return NextResponse.json({
      reports: reports.map((r) => ({
        id: String(r._id),
        slug: r.slug,
        reason: r.reason,
        note: r.note ?? "",
        quote: r.quote ?? "",
        resolved: r.resolved === true,
        createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : String(r.createdAt),
      })),
    });
  } catch (error) {
    return handleRouteError(error);
  }
}

// PATCH /api/admin/wiki/reports: marks one report resolved or open again.
// Auth: requireModerator (admin or moderator)
// Errors: 400, 403, 404
export async function PATCH(request: Request) {
  try {
    const auth = await requireModerator();
    if (!auth.ok) return auth.response;

    const parsed = await parseJsonBody(request, resolveSchema);
    if (!parsed.success) return errorResponse(parsed.status, parsed.error);

    const db = await getDb();
    const { id, resolved } = parsed.data;
    const update = resolved
      ? {
          $set: {
            resolved: true,
            resolvedAt: new Date(),
            resolvedBy: new ObjectId(auth.user.userId),
          },
        }
      : { $set: { resolved: false }, $unset: { resolvedAt: "" as const, resolvedBy: "" as const } };
    const result = await getWikiReportsCollection(db).updateOne({ _id: new ObjectId(id) }, update);
    if (result.matchedCount === 0) return errorResponse(404, "Report not found");

    return NextResponse.json({ success: true });
  } catch (error) {
    return handleRouteError(error);
  }
}
