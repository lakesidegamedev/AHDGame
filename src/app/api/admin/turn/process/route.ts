import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api/requireAdmin";
import { handleRouteError, errorResponse } from "@/lib/api/errors";
import { processTurn } from "@/lib/turnSystem";
import { getDb } from "@/lib/mongodb";
import { turnsOwnedByWorker } from "@/lib/turn/turnWorkerHandoff";
import { queueAdminTurns } from "@/lib/turn/queueAdminTurns";

const MAX_QUEUED_TURNS = 20;

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
      let count = 1;
      try {
        const body = (await request.json()) as { count?: unknown };
        if (typeof body?.count === "number" && Number.isInteger(body.count)) count = body.count;
      } catch {
        // No body: one turn.
      }
      if (count < 1 || count > MAX_QUEUED_TURNS) {
        return errorResponse(400, `count must be between 1 and ${MAX_QUEUED_TURNS}`);
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
