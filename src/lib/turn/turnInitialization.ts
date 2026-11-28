import * as Sentry from "@sentry/nextjs";
import { randomUUID } from "node:crypto";
import { getDb } from "@/lib/mongodb";
import { getGameStateCollection } from "@/lib/db/collections";
import { ObjectId } from "mongodb";
import { getGameState, invalidateGameStateCache } from "@/lib/gameState";
import type { GameState } from "@/lib/db/types";

import { STARTING_YEAR } from "@/lib/constants/turnTime";
import { DEFAULT_GAME_STATE_FLAGS } from "@/lib/seeds/reference/featureFlagDefaults";
import { DEFAULT_CYCLE_ANCHOR_CONTEXT } from "@/lib/elections/cycleAnchorContext";

import { turnHasCommittedWrites } from "@/lib/turn/processingLock";
import { TURN_HOLDER_ID } from "./turnLockHolder";

import { nextScheduledTurnAfter, resolveTurnCronMinute } from "@/lib/cron/turnCronMinute";

// ─── Game state helpers ───────────────────────────────────────────────────────

// Compatibility exports live above; turn orchestration state begins below.

export async function initializeGameState(): Promise<GameState> {
  const db = await getDb();
  const existing = await getGameState(db);
  if (existing) return existing;

  const now = new Date();
  const nextHour = nextScheduledTurnAfter(now, resolveTurnCronMinute());

  const initialState: GameState = {
    _id: "current",
    worldEpochId: new ObjectId().toHexString(),
    resetWorldId: randomUUID(),
    currentTurn: 1,
    hardwareInputReliefStartTurn: 1,
    stockHoldingTaxStartTurn: 1,
    currentYear: STARTING_YEAR,
    // Always pair `startingYear` with the matching `preset`. Writing only
    // `startingYear` previously left `preset` undefined, which made
    // `cycleAnchorContextFromGameState` silently fall back to 2019-default
    // even when the row's `startingYear` was updated to 1991 — producing
    // the "2023 NPC Delegate in a 1991 game" symptom on sandbox.
    // `resetGameWorld` still overwrites both when an admin selects a preset.
    startingYear: DEFAULT_CYCLE_ANCHOR_CONTEXT.startingYear,
    preset: DEFAULT_CYCLE_ANCHOR_CONTEXT.preset,
    isActive: false,
    lastTurnProcessed: now,
    nextScheduledTurn: nextHour,
    pausedAt: null,
    corporationActionsPaused: false,
    playerTransfersPaused: false,
    fastMode: false,
    processingKind: null,
    processingStartedAt: null,
    processingTargetTurn: null,
    processingHeartbeatAt: null,
    processingPhase: null,
    processingPhaseStatuses: null,
    processingPhaseResults: null,
    createdAt: now,
    updatedAt: now,
    // Fresh worlds start with the production feature-flag posture instead of
    // everything-off (see featureFlagDefaults.ts for the rationale).
    ...DEFAULT_GAME_STATE_FLAGS,
  };

  const gameStateCol = await getGameStateCollection(db);
  await gameStateCol.insertOne(initialState);
  return initialState;
}

// True only while THIS process holds the turn-processing lock. Used by the
// graceful-shutdown handler (src/lib/turn/shutdownHandler.ts) to release the
// lock when Railway sends SIGTERM mid-turn on a redeploy — otherwise the lock
// strands with a frozen heartbeat and no turn runs until the 20-min stale
// takeover on a later cron tick (2026-07 stuck-turn incident). Scoping the
// release to the acquiring process makes it safe across concurrent containers:
// a process never clears a lock it did not set.
export const localTurnLock = { held: false };

/**
 * Best-effort release of a turn-processing lock held by THIS process. No-op if
 * this process does not currently hold the lock. Called on graceful shutdown so
 * a redeploy mid-turn recovers instantly instead of waiting out the stale TTL.
 * Guarded by `isProcessing: true` so it never resurrects a lock a newer process
 * already re-acquired and cleared.
 */
export async function releaseLocalProcessingLock(reason: string): Promise<boolean> {
  if (!localTurnLock.held) return false;
  try {
    const db = await getDb();

    // How far did this turn get? A full release wipes `processingPhase` and
    // `processingPhaseStatuses`, which are exactly the fields `shouldRecoverCrashedTurn`
    // reads to decide whether re-running would double-apply. Releasing a turn that had
    // already committed writes therefore made the NEXT cron re-run it from the start and
    // pay every additive income phase twice: fund generation, corp dividends, savings
    // interest, bond coupons, treasury. The guard exists to prevent precisely that,
    // and a clean shutdown was defeating it.
    const live = await (
      await getGameStateCollection(db)
    ).findOne(
      { _id: "current", isProcessing: true, processingHolderId: TURN_HOLDER_ID },
      { projection: { processingPhase: 1 } }
    );
    if (!live) {
      localTurnLock.held = false;
      return false;
    }
    const owned = {
      _id: "current",
      isProcessing: true,
      processingHolderId: TURN_HOLDER_ID,
      processingPhase: live.processingPhase ?? null,
    };
    const committed = turnHasCommittedWrites(live?.processingPhase);

    if (committed) {
      // Keep the lock held and the evidence intact. `processingAbandonedAt` makes the
      // lock read as stale IMMEDIATELY, so the next cron consumes this turn rather than
      // serving the full 20-minute wait first. A deploy then costs the remainder of one
      // turn instead of that turn plus the next slot.
      const abandoned = await (
        await getGameStateCollection(db)
      ).updateOne(owned, { $set: { processingAbandonedAt: new Date(), updatedAt: new Date() } });
      if (abandoned.matchedCount !== 1) return false;
      localTurnLock.held = false;
      invalidateGameStateCache();
      console.warn(
        `[Turn System] Abandoned in-flight turn on ${reason} at phase ${live?.processingPhase}. ` +
          `Lock left held with evidence intact; the next tick will consume the turn rather ` +
          `than re-running and double-applying it.`
      );
      return true;
    }

    // Nothing committed yet, so the turn is losslessly re-runnable: release outright and
    // let the next container simply run it.
    const released = await (
      await getGameStateCollection(db)
    ).updateOne(owned, {
      $set: {
        isProcessing: false,
        processingKind: null,
        processingStartedAt: null,
        processingTargetTurn: null,
        processingHeartbeatAt: null,
        processingPhase: null,
        processingPhaseStatuses: null,
        processingPhaseResults: null,
        processingAbandonedAt: null,
        updatedAt: new Date(),
      },
    });
    if (released.matchedCount !== 1) return false;
    localTurnLock.held = false;
    invalidateGameStateCache();
    console.warn(`[Turn System] Released in-flight processing lock on ${reason}.`);
    return true;
  } catch (err) {
    console.error(`[Turn System] Failed to release processing lock on ${reason}:`, err);
    Sentry.captureException(err, {
      tags: { component: "turnSystem", op: "shutdownLockRelease" },
    });
    return false;
  }
}
