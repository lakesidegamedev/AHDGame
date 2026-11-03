import { NextResponse } from "next/server";
import { handleRouteError, errorResponse } from "@/lib/api/errors";
import { requireSingleplayer } from "@/lib/api/requireSingleplayer";
import { getDb } from "@/lib/mongodb";
import { advanceSingleplayerTurn } from "@/lib/singleplayerTurn";
import { getActiveSingleplayerBatch } from "@/lib/singleplayerBatch";
import { maybeAutosave } from "@/lib/singleplayer/saves";

export const dynamic = "force-dynamic";
export const maxDuration = 600;

/** Advance one normal local-world turn without granting any staff capability. */
export async function POST(request: Request) {
  const denied = requireSingleplayer(request);
  if (denied) return denied;
  try {
    if (getActiveSingleplayerBatch()) {
      return errorResponse(409, "A multi-turn advance is already running.");
    }
    const db = await getDb();
    const outcome = await advanceSingleplayerTurn(db);
    if (!outcome.ok) return errorResponse(outcome.status, outcome.error);
    // Not awaited: the player's turn never waits on, or fails because of, a save.
    void maybeAutosave(db, outcome.turn);

    return NextResponse.json({
      success: true,
      briefing: outcome.briefing,
      turn: outcome.turn,
      message: outcome.message,
      durationSeconds: outcome.durationSeconds,
      ...(outcome.warnings.length > 0 ? { warnings: outcome.warnings } : {}),
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
