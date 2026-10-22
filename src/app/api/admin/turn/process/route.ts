import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api/requireAdmin";
import { handleRouteError, errorResponse } from "@/lib/api/errors";
import { processTurn } from "@/lib/turnSystem";
import { getDb } from "@/lib/mongodb";
import { turnsOwnedByWorker } from "@/lib/turn/turnWorkerHandoff";
import { queueAdminTurns } from "@/lib/turn/queueAdminTurns";
import { parseJsonBody } from "@/lib/api/validate";
import { adminTurnProcessSchema } from "@/lib/api/schemas/admin";

// POST /api/admin/turn/process — Runs a single game turn now. When the turn worker
// owns turns (CRON_OWNER=worker) it queues `count` turns (default 1, max 20) for the
// worker and returns 202 instead: a turn run inside this server would block every
// player request until it finished.
// Auth: requireAdmin
// Errors: 403, 409 (a request is already open), 503 (turn worker offline)
export async function POST(request: Request) {
  try {
    // Verify admin authentication
    const auth = await requireAdmin();
    if (!auth.ok) return auth.response;

    if (turnsOwnedByWorker(process.env)) {
      // The body is optional: a bodiless click (an admin page loaded before this
      // change) means one turn.
      let count = 1;
      if (request.headers.get("content-type")?.includes("application/json")) {
        const parsed = await parseJsonBody(request, adminTurnProcessSchema);
        if (!parsed.success) return errorResponse(parsed.status, parsed.error);
        count = parsed.data.count;
      }
      return queueAdminTurns(await getDb(), { count, requestedBy: auth.admin.username });
    }

    const start = performance.now();
    const result = await processTurn();
    const durationSeconds = Math.round((performance.now() - start) / 100) / 10;

    // Critical failure: turn didn't advance at all
    if (result.turn === 0) {
      return errorResponse(500, result.message);
    }

    // Turn processed (possibly with phase warnings)
    return NextResponse.json({
      success: true,
      turn: result.turn,
      message: result.message,
      durationSeconds,
      ...(result.warnings.length > 0 ? { warnings: result.warnings } : {}),
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
