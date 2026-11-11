import { NextResponse } from "next/server";
import { getDb } from "@/lib/mongodb";
import { withAdminAuth } from "@/lib/api/withAdminAuth";
import { handleRouteError, errorResponse } from "@/lib/api/errors";
import { codeQualitySnapshotsCollection } from "@/lib/db/repositories/codeQualitySnapshots";
import type { Document } from "mongodb";

/**
 * Get the most recent code quality snapshot, optionally filtered by environment.
 * Auth: requireAdmin()
 * Errors: 403, 404
 */
export const GET = withAdminAuth(async (_auth, request: Request) => {
  try {
    const url = new URL(request.url);
    const environment = url.searchParams.get("environment") || undefined;

    const db = await getDb();
    const filter: Record<string, unknown> = {};
    if (environment) filter.environment = environment;

    const snapshot = await codeQualitySnapshotsCollection<Document>(db).findOne(filter, {
      sort: { timestamp: -1 },
    });

    if (!snapshot) {
      return errorResponse(404, "No snapshots available");
    }

    return NextResponse.json({ snapshot });
  } catch (error) {
    return handleRouteError(error);
  }
});
