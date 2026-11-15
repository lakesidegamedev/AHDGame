import { NextResponse } from "next/server";
import { getDb } from "@/lib/mongodb";
import { requireAdmin } from "@/lib/api/requireAdmin";
import { handleRouteError, errorResponse } from "@/lib/api/errors";
import { gameHealthSnapshotsCollection } from "@/lib/db/repositories/gameHealthSnapshots";
import type { Document } from "mongodb";

/**
 * Get the most recent game health snapshot.
 * Auth: requireAdmin()
 * Errors: 403, 404
 */
export async function GET() {
  try {
    const auth = await requireAdmin();
    if (!auth.ok) return auth.response;

    const db = await getDb();
    const snapshot = await gameHealthSnapshotsCollection<Document>(db).findOne(
      {},
      { sort: { turn: -1 } }
    );

    if (!snapshot) {
      return errorResponse(404, "No snapshots available");
    }

    return NextResponse.json({ snapshot });
  } catch (error) {
    return handleRouteError(error);
  }
}
