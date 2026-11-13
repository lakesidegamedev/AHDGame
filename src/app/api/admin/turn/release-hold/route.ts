import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api/requireAdmin";
import { handleRouteError, errorResponse } from "@/lib/api/errors";
import { parseJsonBody } from "@/lib/api/validate";
import { adminTurnReleaseHoldSchema } from "@/lib/api/schemas/admin";
import { getDb } from "@/lib/mongodb";
import { gameStateCollection } from "@/lib/db/repositories/gameState";
import { invalidateGameStateCache } from "@/lib/gameState";
import { createAdminLog } from "@/lib/adminLog";
import { planHoldRelease } from "@/lib/turn/rules/holdRelease";

// POST /api/admin/turn/release-hold - Releases a turn held after a mid-turn process death.
// Body: { mode: "rerun" | "mark-done", acknowledge: string[], confirmRepaired?: true } naming exactly
// the held steps; rerun requires confirmRepaired because a half-applied step would apply twice.
// "rerun" clears the held steps so the next attempt runs them again; "mark-done" records them
// as finished by an operator. The next turn tick then resumes the turn.
// Auth: requireAdmin
// Errors: 400, 403, 404, 409
export async function POST(request: Request) {
  try {
    const auth = await requireAdmin();
    if (!auth.ok) return auth.response;
    const parsed = await parseJsonBody(request, adminTurnReleaseHoldSchema);
    if (!parsed.success) return errorResponse(parsed.status, parsed.error);

    const db = await getDb();
    const state = await gameStateCollection(db).findOne(
      { _id: "current" },
      {
        projection: {
          processingHoldReason: 1,
          processingHeldPhases: 1,
          processingTargetTurn: 1,
        },
      }
    );
    if (!state) return errorResponse(404, "Game state not initialized");

    const plan = planHoldRelease(state, parsed.data, new Date());
    if (!plan.ok) return errorResponse(409, plan.error);

    const result = await gameStateCollection(db).updateOne(
      {
        _id: "current",
        processingHoldReason: state.processingHoldReason ?? null,
        processingTargetTurn: state.processingTargetTurn ?? null,
      },
      Object.keys(plan.unset).length > 0
        ? { $set: plan.set, $unset: plan.unset }
        : { $set: plan.set }
    );
    if (result.matchedCount === 0) {
      return errorResponse(409, "The hold changed while releasing. Nothing was changed; retry.");
    }
    invalidateGameStateCache();
    await createAdminLog({
      category: "system",
      action: "turn_hold_released",
      username: auth.admin.username,
      adminUsername: auth.admin.username,
      details: `Released turn hold (${parsed.data.mode}) for ${state.processingHeldPhases?.join(", ")}`,
    });
    return NextResponse.json({
      success: true,
      released: state.processingHeldPhases,
      mode: parsed.data.mode,
      message: "Hold released. The next turn tick resumes the turn.",
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
