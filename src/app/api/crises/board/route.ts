/**
 * Crisis board for the player-facing crises page: every crisis grouped and
 * scored, plus the viewer's exposure and available actions when signed in.
 * GET /api/crises/board
 * Auth: optional. The body differs per viewer, so it is never cached.
 */
import { NextResponse } from "next/server";
import { getDb } from "@/lib/mongodb";
import { getAuthUserWithCharacter } from "@/lib/auth";
import { handleRouteError } from "@/lib/api/errors";
import { loadCrisisBoard, viewerFromCharacter } from "@/lib/crises/queries/crisisBoard";

export async function GET() {
  try {
    const db = await getDb();
    const user = await getAuthUserWithCharacter();
    const viewer =
      user?.hasCharacter && user.character ? await viewerFromCharacter(db, user.character) : null;
    const board = await loadCrisisBoard(db, viewer);
    return NextResponse.json(board, {
      headers: { "Cache-Control": "private, no-store, no-transform" },
    });
  } catch (error) {
    return handleRouteError(error, { route: "GET /api/crises/board" });
  }
}
