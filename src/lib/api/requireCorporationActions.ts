import { NextResponse } from "next/server";
import type { Db } from "mongodb";
import { getGameStateCollection } from "@/lib/db/collections";
import { errorResponse } from "@/lib/api/errors";

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
 * Blocks writes to companies and sectors during the corporation phase of a
 * turn, whether it is running or held there after a stop (a stopped turn keeps
 * `processingPhase` until it completes). That phase plans every plant from its
 * own read and the funded producer market refuses to settle when a plant's
 * owner or physical state changed under it, and a resumed phase must rebuild
 * the same money moves it already applied. Other phases leave companies alone,
 * so actions stay open for the rest of the turn.
 */
export const CORPORATION_PHASE = "corporationTurn";
function inCorporationPhase(gameState: { processingPhase?: string | null } | null | undefined) {
  return gameState?.processingPhase === CORPORATION_PHASE;
}
export async function requireNoTurnInProgress(db: Db): Promise<NextResponse | null> {
  const col = await getGameStateCollection(db);
  const gameState = await col.findOne({ _id: "current" }, { projection: { processingPhase: 1 } });
  if (inCorporationPhase(gameState))
    return errorResponse(409, "Companies are being settled for this turn, try again shortly.");
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
      projection: { corporationActionsPaused: 1, processingKind: 1, processingPhase: 1 },
    }
  );

  if (gameState?.processingKind === "stockTaxMigration")
    return errorResponse(409, "Stock holding maintenance is in progress, try again shortly.");
  if (gameState?.processingKind === "economyReset")
    return errorResponse(409, "Economy maintenance is in progress, try again shortly.");
  if (inCorporationPhase(gameState))
    return errorResponse(409, "Companies are being settled for this turn, try again shortly.");
  if (gameState?.corporationActionsPaused) {
    return errorResponse(403, "Corporation actions are currently paused by an admin");
  }

  return null;
}
