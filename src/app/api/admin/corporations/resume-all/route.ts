// POST /api/admin/corporations/resume-all
// Clears suspension on all suspended corporations at once.
// Auth: requireAdmin
// Errors: 403

import { NextResponse } from "next/server";
import { getDb } from "@/lib/mongodb";
import { withAdminAuth } from "@/lib/api/withAdminAuth";
import { handleRouteError } from "@/lib/api/errors";
import { corporationsCollection } from "@/lib/db/repositories/corporations";

export const POST = withAdminAuth(async () => {
  try {
    const db = await getDb();
    const { modifiedCount } = await corporationsCollection(db).updateMany(
      { suspended: true },
      { $set: { suspended: false, suspendedUntilTurn: 0, updatedAt: new Date() } }
    );

    return NextResponse.json({ success: true, modifiedCount });
  } catch (error) {
    return handleRouteError(error);
  }
});
