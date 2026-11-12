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

export type ParsedHolderId = { host: string; pid: string; bootId: string };

/** `<host>:<pid>:<bootId>`; the host is everything before the last two parts. */
export function parseHolderId(id: string | null | undefined): ParsedHolderId | null {
  if (!id) return null;
  const parts = id.split(":");
  if (parts.length < 3) return null;
  const bootId = parts[parts.length - 1];
  const pid = parts[parts.length - 2];
  const host = parts.slice(0, -2).join(":");
  if (!host || !pid || !bootId) return null;
  return { host, pid, bootId };
}

/**
 * A lock the watchdog may take over before the long stale window: a turn lock
 * whose heartbeat is older than the fast window AND whose holder is provably
 * dead. There is one worker process per host, so a holder on this host with a
 * different boot id than ours belongs to a process that has gone. A holder on
 * another host, or one that cannot be identified, may merely be blocked, so it
 * keeps the long window (the ordinary stale-lock rules) even at stage 1.
 */
export function shouldFastTakeOverStaleLock(
  lock: FastTakeoverLockView | null | undefined,
  now: Date,
  stage: number,
  self: { host: string; bootId: string },
  staleMs = TURN_LOCK_FAST_STALE_MS
): boolean {
  if (stage < 1 || !lock) return false;
  if (lock.isProcessing !== true || lock.processingKind !== "turn") return false;
  if (lock.processingAbandonedAt != null) return false;
  if (!lock.processingHeartbeatAt) return false;
  const holder = parseHolderId(lock.processingHolderId);
  if (!holder || holder.host !== self.host || holder.bootId === self.bootId) return false;
  return now.getTime() - new Date(lock.processingHeartbeatAt).getTime() > staleMs;
}
