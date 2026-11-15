import { NextResponse } from "next/server";
import { requireModerator } from "@/lib/api/requireModerator";
import { getDb } from "@/lib/mongodb";
import { parseBoundedIntParam } from "@/lib/api/validate";
import { clientDiagnosticsCollection } from "@/lib/db/repositories/clientDiagnostics";
import type { Document } from "mongodb";

export const dynamic = "force-dynamic";

/** Read-only, moderator-scoped intake view for redacted native client reports. */
export async function GET(request: Request) {
  const auth = await requireModerator();
  if (!auth.ok) return auth.response;
  const limit = parseBoundedIntParam(new URL(request.url).searchParams, "limit", 25, 1, 100);
  const db = await getDb();
  const collection = clientDiagnosticsCollection<Document>(db);
  const since = new Date(Date.now() - 30 * 86_400_000);
  const [reports, total, byVersion, byReason] = await Promise.all([
    collection
      .find({ receivedAt: { $gte: since } })
      .sort({ receivedAt: -1 })
      .limit(limit)
      .toArray(),
    collection.countDocuments({ receivedAt: { $gte: since } }),
    collection
      .aggregate([
        { $match: { receivedAt: { $gte: since } } },
        { $group: { _id: "$clientVersion", count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ])
      .toArray(),
    collection
      .aggregate([
        { $match: { receivedAt: { $gte: since } } },
        { $group: { _id: "$reason", count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ])
      .toArray(),
  ]);
  return NextResponse.json(
    {
      windowDays: 30,
      total,
      byVersion,
      byReason,
      reports: reports.map((report) => ({ ...report, _id: report._id.toString() })),
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
