import { logger } from "@/lib/observability/logger";
import { randomUUID } from "node:crypto";
import { ApiError } from "@/lib/api/errors";
import { withAdminRoute } from "@/lib/api/withAdminAuth";
// POST /api/admin/forex/enable — One-time migration to enable the forex system.
// Auth: requireAdmin
// Errors: 400 (already enabled), 403, 404, 409 (turn processing)
import { NextResponse } from "next/server";
import { errorResponse } from "@/lib/api/errors";
import { getDb } from "@/lib/mongodb";
import { getProcessingLockState } from "@/lib/turn/processingLock";
import {
  migrateCharacterBalances,
  seedExchangeRates,
  migrateCorporationLiquidCapital,
  updateCentralBanks,
  createForexIndexes,
} from "@/lib/currency/migration";
import { getGameStatePresetOrDefault } from "@/lib/db/collections/gameState";
import { gameStateCollection } from "@/lib/db/repositories/gameState";

const FOREX_MIGRATION_HEARTBEAT_MS = 30_000;

export const POST = withAdminRoute(async (_auth) => {
  const db = await getDb();
  const gameStateCol = gameStateCollection(db);
  const gameState = await gameStateCol.findOne({ _id: "current" });

  if (!gameState) {
    return errorResponse(404, "Game state not initialized");
  }

  if (gameState.forexEnabled) {
    return errorResponse(400, "Forex already enabled");
  }

  if (gameState.isProcessing) {
    // The forex migration takes its own lock, so it cannot proceed while
    // any turn-lock exists. But if the lock is stale (prior process crashed
    // mid-turn), the generic "wait for it to finish" message dead-ends the
    // admin — surface the staleness + the reset path explicitly so they
    // know to clear the lock via /api/admin/turn/reset-lock before retrying.
    const lockState = getProcessingLockState(gameState);
    if (lockState.isStale) {
      return errorResponse(
        409,
        "Turn processing lock appears stale (prior turn likely crashed). Reset the lock via Admin → Turn → Reset Lock, then retry forex enable.",
        { extra: { lockStale: true, lockLastTouch: lockState.lastTouch?.toISOString() ?? null } }
      );
    }
    return errorResponse(409, "Turn is currently processing. Wait for it to finish.");
  }

  // Lock — prevent turns during migration
  const lockStartedAt = new Date();
  const holderId = randomUUID();
  const owned = {
    _id: "current",
    isProcessing: true,
    processingKind: "forexMigration" as const,
    processingHolderId: holderId,
  };
  let acquired;
  try {
    acquired = await gameStateCol.updateOne(
      {
        _id: "current",
        isProcessing: { $ne: true },
        resetAdmissionId: null,
        currentTurn: gameState.currentTurn,
        forexEnabled: { $ne: true },
        ...(gameState.worldEpochId != null
          ? { worldEpochId: gameState.worldEpochId }
          : { worldEpochId: { $exists: false } }),
      },
      {
        $set: {
          isProcessing: true,
          processingHolderId: holderId,
          processingKind: "forexMigration",
          processingPhase: "forexMigration",
          processingStartedAt: lockStartedAt,
          processingHeartbeatAt: lockStartedAt,
          updatedAt: lockStartedAt,
        },
      }
    );
  } catch (error) {
    await gameStateCol
      .updateOne(owned, {
        $set: {
          isProcessing: false,
          processingHolderId: null,
          processingKind: null,
          processingPhase: null,
          processingStartedAt: null,
          processingHeartbeatAt: null,
        },
      })
      .catch((cleanupError) =>
        logger.error("forex-enable", "Migration admission cleanup failed", cleanupError)
      );
    throw error;
  }
  if (acquired.matchedCount !== 1)
    return errorResponse(409, "Turn or world state changed. Refresh and retry forex enable.");

  const heartbeatTimer = setInterval(() => {
    void gameStateCol
      .updateOne(owned, {
        $set: {
          processingHeartbeatAt: new Date(),
          processingPhase: "forexMigration",
        },
      })
      .catch(() => {
        // Best-effort heartbeat only. The route still clears the lock in the main flow.
      });
  }, FOREX_MIGRATION_HEARTBEAT_MS);

  try {
    const preset = await getGameStatePresetOrDefault(db);
    const requireOwnership = async () => {
      if (!(await gameStateCol.findOne(owned, { projection: { _id: 1 } })))
        throw new ApiError(409, "Forex migration no longer owns the processing lock.");
    };
    await requireOwnership();
    const migrationResult = await migrateCharacterBalances(db, preset);
    await requireOwnership();
    await seedExchangeRates(db, preset);
    await requireOwnership();
    const corpMigrationResult = await migrateCorporationLiquidCapital(db);
    await requireOwnership();
    await updateCentralBanks(db, preset);
    await requireOwnership();
    await createForexIndexes(db);

    // Flip the flag and release lock
    const completed = await gameStateCol.updateOne(owned, {
      $set: {
        forexEnabled: true,
        isProcessing: false,
        processingHolderId: null,
        processingKind: null,
        processingPhase: null,
        processingStartedAt: null,
        processingHeartbeatAt: null,
        updatedAt: new Date(),
      },
    });

    if (completed.matchedCount !== 1)
      throw new ApiError(409, "Forex migration no longer owns the processing lock.");

    return NextResponse.json({
      success: true,
      message: "Forex system enabled",
      migration: {
        charactersProcessed: migrationResult.processed,
        charactersSkipped: migrationResult.skipped,
        corporationsProcessed: corpMigrationResult.processed,
        corporationsSkipped: corpMigrationResult.skipped,
      },
    });
  } catch (migrationError) {
    // Release lock but do NOT set forexEnabled — allows retry after fix
    await gameStateCol.updateOne(owned, {
      $set: {
        isProcessing: false,
        processingHolderId: null,
        processingKind: null,
        processingPhase: null,
        processingStartedAt: null,
        processingHeartbeatAt: null,
        updatedAt: new Date(),
      },
    });
    throw migrationError;
  } finally {
    clearInterval(heartbeatTimer);
  }
});
