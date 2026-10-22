import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api/requireAdmin";
import { handleRouteError, errorResponse } from "@/lib/api/errors";
import { processTurn } from "@/lib/turnSystem";
import { parseJsonBody } from "@/lib/api/validate";
import { adminTurnBatchSchema } from "@/lib/api/schemas/admin";
import { getDb } from "@/lib/mongodb";
import { turnsOwnedByWorker } from "@/lib/turn/turnWorkerHandoff";
import { queueAdminTurns } from "@/lib/turn/queueAdminTurns";

// POST /api/admin/turn/batch — Processes multiple game turns in sequence and returns per-turn results.
// When the turn worker owns turns (CRON_OWNER=worker) it queues them for the worker
// and returns 202 instead of running them inside this server.
// Auth: requireAdmin
// Errors: 400, 403, 409 (a request is already open), 503 (turn worker offline)
export async function POST(request: Request) {
  try {
    const auth = await requireAdmin();
    if (!auth.ok) return auth.response;

    const parsed = await parseJsonBody(request, adminTurnBatchSchema);
    if (!parsed.success) {
      return errorResponse(parsed.status, parsed.error);
    }
    const { count } = parsed.data;

    if (turnsOwnedByWorker(process.env)) {
      return queueAdminTurns(await getDb(), { count, requestedBy: auth.admin.username });
    }

    const results: { turn: number; message: string; warnings?: string[] }[] = [];
    const start = performance.now();

    for (let i = 0; i < count; i++) {
      const result = await processTurn();
      if (result.turn === 0) {
        // Critical failure — turn didn't advance at all
        return errorResponse(500, `Turn ${i + 1} failed: ${result.message}`, {
          extra: { completed: i, results },
        });
      }
      results.push({
        turn: result.turn,
        message: result.message,
        ...(result.warnings.length > 0 ? { warnings: result.warnings } : {}),
      });
    }

    const durationSeconds = Math.round((performance.now() - start) / 100) / 10;

    return NextResponse.json({
      success: true,
      completed: count,
      finalTurn: results[results.length - 1]?.turn,
      message: `Successfully processed ${count} turn${count !== 1 ? "s" : ""}.`,
      durationSeconds,
      results,
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
