import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api/requireAdmin";
import { handleRouteError, errorResponse } from "@/lib/api/errors";
import { stopTurnSystem } from "@/lib/turnSystem";
import { createAdminLog } from "@/lib/adminLog";

// POST /api/admin/turn/stop — Pauses the turn system so no new turns are processed until restarted.
// Auth: requireAdmin
// Errors: 403
export async function POST() {
  try {
    const auth = await requireAdmin();
    if (!auth.ok) return auth.response;

    const result = await stopTurnSystem();

    if (!result.success) {
      return errorResponse(500, result.message);
    }

    await createAdminLog({
      category: "system",
      action: "turn_system_stopped",
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
