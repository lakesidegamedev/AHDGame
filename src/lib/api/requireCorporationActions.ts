import { isTurnProcessingNow } from "@/lib/turn/processingLock";
import { NextResponse } from "next/server";
import type { Db } from "mongodb";
import { getGameStateCollection } from "@/lib/db/collections";
import { errorResponse } from "@/lib/api/errors";
import { corporationActionsPause } from "@/lib/corporations/corporationActionsPause";

/**
 * Full-game pause gate (`gameState.isActive === false`): admin stop, auto-drift
 * pause, or pre-start / pre-launch worlds. Same signal and message as
 * `executeAction` / influence — not the narrower `corporationActionsPaused` flag.
 *
 * Do NOT use this on corporation founding or CEO corp-mutation routes. Turns may
 * be paused on purpose during registration / settling windows so players can
 * still found companies and place first plants (ticket #1009; #1004 over-gated).
 * Political spends and reputation influence keep their own `isActive` checks.
 */
export async function requireGameActive(db: Db): Promise<NextResponse | null> {
  const col = await getGameStateCollection(db);
  const gameState = await col.findOne({ _id: "current" }, { projection: { isActive: 1 } });

  if (gameState && gameState.isActive === false) {
    return errorResponse(409, "The game is currently paused.");
  }

  return null;
}

/**
 * Blocks CEO corp mutations while an admin has paused corporation actions.
 *
 * Intentionally does NOT consult `gameState.isActive`. A turns-paused world
 * (registration settle, launch staging) must still allow founding and plant
 * placement; only the corp-actions kill switch freezes existing CEOs.
 *
 * Corp *founding* (`POST /api/corporations`) stays exempt from this guard
 * entirely — callers there must not invoke it.
 */
export async function requireCorporationActionsEnabled(db: Db): Promise<NextResponse | null> {
  const col = await getGameStateCollection(db);
  const gameState = await col.findOne(
    { _id: "current" },
    {
      projection: {
        corporationActionsPaused: 1,
        processingKind: 1,
        isProcessing: 1,
        processingHeartbeatAt: 1,
        processingAbandonedAt: 1,
        processingStartedAt: 1,
        updatedAt: 1,
      },
    }
  );

  if (gameState && isTurnProcessingNow(gameState))
    return errorResponse(
      409,
      "Corporate cash and taxes are settling this turn. Try again shortly."
    );
  const pause = corporationActionsPause(gameState);
  return pause ? errorResponse(pause.status, pause.message) : null;
}
