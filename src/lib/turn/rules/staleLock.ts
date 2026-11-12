/**
 * Rules for the fast stale-lock takeover. Plain data in, plain data out: the
 * clock arrives as an argument and nothing here touches the database.
 */

/** Six missed 30 s heartbeats. */
export const TURN_LOCK_FAST_STALE_MS = 3 * 60 * 1000;

export type TurnResilienceStageInput = {
  configStage: number | null | undefined;
  simSandbox: boolean;
  /** Raw env override; honoured only for a sandbox world. */
  envStage: string | null | undefined;
};

/** 0 (or absent) is today's behaviour. */
export function resolveTurnResilienceStage(input: TurnResilienceStageInput): number {
  if (input.simSandbox && input.envStage != null && input.envStage !== "") {
    const fromEnv = Number(input.envStage);
    if (Number.isFinite(fromEnv) && fromEnv >= 0) return Math.floor(fromEnv);
  }
  const fromConfig = input.configStage;
  return typeof fromConfig === "number" && Number.isFinite(fromConfig) && fromConfig > 0
    ? Math.floor(fromConfig)
    : 0;
}

export type FastTakeoverLockView = {
  isProcessing?: boolean | null;
  processingKind?: string | null;
  processingHolderId?: string | null;
  processingHeartbeatAt?: Date | null;
  processingAbandonedAt?: Date | null;
};

/**
 * A lock the watchdog may take over right now: a turn lock with a known holder
 * whose heartbeat is older than the fast window. A lock without a holder id was
 * written by an older build and keeps the long window.
 */
export function shouldFastTakeOverStaleLock(
  lock: FastTakeoverLockView | null | undefined,
  now: Date,
  stage: number,
  staleMs = TURN_LOCK_FAST_STALE_MS
): boolean {
  if (stage < 1 || !lock) return false;
  if (lock.isProcessing !== true || lock.processingKind !== "turn") return false;
  if (lock.processingAbandonedAt != null) return false;
  if (!lock.processingHolderId || !lock.processingHeartbeatAt) return false;
  return now.getTime() - new Date(lock.processingHeartbeatAt).getTime() > staleMs;
}
