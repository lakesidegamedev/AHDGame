import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api/requireAdmin";
import { handleRouteError, errorResponse } from "@/lib/api/errors";
import { startTurnSystem } from "@/lib/turnSystem";
import { createAdminLog } from "@/lib/adminLog";

// POST /api/admin/turn/start — Starts the turn system so it processes turns on the hourly cron schedule.
// Auth: requireAdmin
// Errors: 403
export async function POST() {
  try {
    const auth = await requireAdmin();
    if (!auth.ok) return auth.response;

    const result = await startTurnSystem();

    if (!result.success) {
      return errorResponse(500, result.message);
    }

    await createAdminLog({
      category: "system",
      action: "turn_system_started",
      username: auth.admin.username,
      adminUsername: auth.admin.username,
      details: result.message,
    });

    return NextResponse.json({
      success: true,
      message: result.message,
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
