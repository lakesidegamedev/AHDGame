import { randomUUID } from "crypto";
import { hostname } from "os";
import type { Db } from "mongodb";
import { gameStateCollection } from "@/lib/db/repositories/gameState";
import { shouldFastTakeOverStaleLock } from "@/lib/turn/rules/staleLock";
import { workerConfig } from "@/lib/config/worker";

const BOOT_ID = randomUUID();
const HOST = workerConfig.replicaId() ?? hostname();

/** Worker instance, pid and boot id: unique per process lifetime. */
export const TURN_HOLDER_ID = `${HOST}:${process.pid}:${BOOT_ID}`;
const SELF = { host: HOST };

/** Signal 0 probes without sending anything; EPERM means the process exists. */
function pidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return (err as NodeJS.ErrnoException).code === "EPERM";
  }
}

let fencedHolderId: string | null = null;
let lockLost = false;

/** Raised when this process no longer holds the turn lock. Never retried. */
export class TurnLockLostError extends Error {
  constructor(detail: string) {
    super(`Turn lock lost: ${detail}. This process stops writing for the turn.`);
    this.name = "TurnLockLostError";
  }
}

export function markTurnLockLost(): void {
  lockLost = true;
}

export function isTurnLockLost(): boolean {
  return lockLost;
}

/** While set, this process's lock writes only apply if it still holds the lock. */
export function setTurnLockFence(holderId: string | null): void {
  fencedHolderId = holderId;
  lockLost = false;
}

export function turnLockFenceActive(): boolean {
  return fencedHolderId !== null;
}

/** Extra filter fields for any gameState write that belongs to the lock holder. */
export function turnLockFenceFilter(): {
  processingHolderId?: string;
  processingAbandonedAt?: null;
} {
  return fencedHolderId ? { processingHolderId: fencedHolderId, processingAbandonedAt: null } : {};
}

/**
 * Marks a stale turn lock abandoned, compare-and-set on the exact holder id and
 * heartbeat read, so a holder that renewed in the meantime keeps its lock and two
 * watchdogs cannot both claim it. Abandoning keeps the crash evidence; the
 * caller then runs the normal turn, which acquires an abandoned lock at once
 * and resumes from the recorded step.
 */
export async function tryFastStaleLockTakeover(
  db: Pick<Db, "collection">,
  stage: number,
  now = new Date()
): Promise<boolean> {
  const col = gameStateCollection(db as Db);
  const lock = await col.findOne(
    { _id: "current" },
    {
      projection: {
        isProcessing: 1,
        processingKind: 1,
        processingHolderId: 1,
        processingHeartbeatAt: 1,
        processingAbandonedAt: 1,
      },
    }
  );
  if (lock?.processingHolderId === TURN_HOLDER_ID) return false;
  if (!shouldFastTakeOverStaleLock(lock, now, stage, SELF, pidAlive)) return false;
  const res = await col.updateOne(
    {
      _id: "current",
      isProcessing: true,
      processingKind: "turn",
      processingHolderId: lock!.processingHolderId!,
      processingHeartbeatAt: lock!.processingHeartbeatAt!,
      processingAbandonedAt: null,
    },
    { $set: { processingAbandonedAt: now, updatedAt: now } }
  );
  return res.modifiedCount === 1;
}
