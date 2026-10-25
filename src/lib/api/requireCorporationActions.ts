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
 * Blocks writes to companies and sectors while a turn is running or is held
 * part way (a stopped turn keeps `processingPhase` until it completes). The
 * funded producer market plans every plant from the turn's own read and
 * refuses to settle when a plant's owner or physical state changed under it,
 * and a resumed turn must rebuild the same money moves it already applied, so
 * a spin-off, dissolution or sector change mid-turn holds the turn.
 */
export async function requireNoTurnInProgress(db: Db): Promise<NextResponse | null> {
  const col = await getGameStateCollection(db);
  const gameState = await col.findOne(
    { _id: "current" },
    { projection: { isProcessing: 1, processingPhase: 1 } }
  );
  if (gameState?.isProcessing === true || gameState?.processingPhase != null)
    return errorResponse(409, "A turn is being processed, try again shortly.");
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
        processingPhase: 1,
      },
    }
  );

  if (gameState?.processingKind === "stockTaxMigration")
    return errorResponse(409, "Stock holding maintenance is in progress, try again shortly.");
  if (gameState?.processingKind === "economyReset")
    return errorResponse(409, "Economy maintenance is in progress, try again shortly.");
  if (gameState?.isProcessing === true || gameState?.processingPhase != null)
    return errorResponse(409, "A turn is being processed, try again shortly.");
  if (gameState?.corporationActionsPaused) {
    return errorResponse(403, "Corporation actions are currently paused by an admin");
  }

  return null;
}
