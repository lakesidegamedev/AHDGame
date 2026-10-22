import type { Db } from "mongodb";
import type { GameConfig } from "@/lib/db/types/gameConfig";
import type { GameState } from "@/lib/db/types/gameState";
import {
  TX_TTL_TURNS,
  DEFAULT_TURN_LENGTH_MINUTES,
  TX_TTL_DEFAULT_MS,
} from "@/lib/db/types/financialTxLog";

/**
 * Wall-clock minutes between turns while `gameState.fastMode` is on. The turn
 * cron fires at :00 and :30 (`getCronSchedule` in `src/lib/cron.ts`).
 */
export const FAST_MODE_TURN_LENGTH_MINUTES = 30;

/**
 * Wall-clock minutes per turn. Fast mode halves the cadence without touching
 * `gameConfig.turnLengthMinutes`, so the configured value alone overstates the
 * turn length 2x in a fast-mode world and every turn-denominated TTL keeps
 * twice the intended number of turns.
 */
export function effectiveTurnLengthMinutes(
  configuredMinutes: number | undefined,
  fastMode: boolean | undefined
): number {
  if (fastMode) return FAST_MODE_TURN_LENGTH_MINUTES;
  return configuredMinutes ?? DEFAULT_TURN_LENGTH_MINUTES;
}

/**
 * Compute the `expiresAt` Date for a tx emitted at `createdAt`, using the
 * current wall-clock turn length (see {@link loadTurnLengthMinutes}) to size
 * the 168-turn retention window.
 *
 * Why a helper: emitters used to hardcode `createdAt + TX_TTL_MS` (96h
 * wall-clock). Switching the constant alone would silently shrink retention
 * if turn cadence changes; routing every emit through this helper keeps
 * "168 turns" the meaningful unit even when admins re-time the game.
 */
export async function computeExpiresAt(db: Db, createdAt: Date): Promise<Date> {
  return computeExpiresAtSync(createdAt, await loadTurnLengthMinutes(db));
}

/**
 * Synchronous variant for batch loops where the caller has already loaded
 * `turnLengthMinutes` once. Avoids re-reading gameConfig on every entry.
 */
export function computeExpiresAtSync(createdAt: Date, turnLengthMinutes: number): Date {
  const ttlMs = TX_TTL_TURNS * turnLengthMinutes * 60_000;
  return new Date(createdAt.getTime() + ttlMs);
}

/**
 * Wall-clock minutes per turn: `gameConfig.turnLengthMinutes`, or
 * {@link FAST_MODE_TURN_LENGTH_MINUTES} while `gameState.fastMode` is on.
 * Falls back to the default if absent. Used by emitTxBulk to load it once
 * per call.
 */
export async function loadTurnLengthMinutes(db: Db): Promise<number> {
  const [cfg, state] = await Promise.all([
    db
      .collection<GameConfig>("gameConfig")
      .findOne({ _id: "default" }, { projection: { turnLengthMinutes: 1 } }),
    db
      .collection<GameState>("gameState")
      .findOne({ _id: "current" }, { projection: { fastMode: 1 } }),
  ]);
  return effectiveTurnLengthMinutes(cfg?.turnLengthMinutes, state?.fastMode);
}

/**
 * Last-resort default expiresAt — no DB lookup. Tests + ad-hoc scripts that
 * don't have access to the gameConfig collection use this. Equivalent to the
 * default 168-turn × 60-min cadence (= 7 IRL days).
 */
export function defaultExpiresAt(createdAt: Date): Date {
  return new Date(createdAt.getTime() + TX_TTL_DEFAULT_MS);
}
