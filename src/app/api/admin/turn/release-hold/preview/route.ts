import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api/requireAdmin";
import { handleRouteError, errorResponse } from "@/lib/api/errors";
import { getDb } from "@/lib/mongodb";
import { loadHeldState, previewHeldTurn } from "@/lib/turn/holdPreview";

// GET /api/admin/turn/release-hold/preview - Read-only. For a held turn, what each held step
// already wrote for the target turn (counts and money totals where the step leaves a trace) and a
// previewToken that release-hold requires. A step that leaves no trace to query reports "unknown".
// Auth: requireAdmin
// Errors: 403, 404, 409 (nothing is held)
export async function GET() {
  try {
    const auth = await requireAdmin();
    if (!auth.ok) return auth.response;
    const db = await getDb();
    const state = await loadHeldState(db);
    if (!state) return errorResponse(404, "Game state not initialized");
    const preview = await previewHeldTurn(db, state);
    if (!preview)
      return errorResponse(409, "The turn lock is not held; there is nothing to preview.");
    return NextResponse.json({
      success: true,
      holdReason: state.processingHoldReason ?? null,
      ...preview,
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
