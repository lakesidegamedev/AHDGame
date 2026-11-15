import { NextResponse } from "next/server";
import { getDb } from "@/lib/mongodb";
import { requireAdmin } from "@/lib/api/requireAdmin";
import { handleRouteError } from "@/lib/api/errors";
import { nppsCollection } from "@/lib/db/repositories/npps";
import type { Document } from "mongodb";

// POST /api/admin/npps/clear-cooldowns — Clears all election cooldowns from every NPP to fix stale cooldowns
// Auth: requireAdmin
// Errors: 403
export async function POST() {
  try {
    const auth = await requireAdmin();
    if (!auth.ok) return auth.response;

    const db = await getDb();

    // Clear all electionCooldowns from all NPPs
    const result = await nppsCollection<Document>(db).updateMany(
      { electionCooldowns: { $exists: true, $ne: {} } },
      { $set: { electionCooldowns: {} } }
    );

    return NextResponse.json({
      success: true,
      modified: result.modifiedCount,
      matched: result.matchedCount,
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
