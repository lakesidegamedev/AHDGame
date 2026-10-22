/**
 * Turns belong to the turn worker whenever `CRON_OWNER=worker`.
 *
 * `processTurn` holds the Node event loop for the whole turn (tens of minutes on a
 * large world). Run inside the web server, it stops the server answering anyone:
 * on 2026-10-22 an admin "process turn" click ran turn 372 inside web while the
 * worker was stopped, the site timed out for every player, and two phases then
 * hit their timeout under the contention and the turn needed a manual repair.
 * `CRON_OWNER=worker` only moved the SCHEDULE out of web; every manual trigger
 * still ran the turn inline.
 *
 * So, when the worker owns turns:
 *   - `processTurn` refuses to run inside the Next.js server (`inProcessTurnRefusal`).
 *   - Admin "process" and "batch" queue a request in `turnWorkerControl` instead,
 *     and the worker claims and runs it (`runTurnRequestTick`).
 *   - The worker writes a heartbeat. With no live worker the admin action fails
 *     loudly (503) rather than queueing something nobody will run.
 *
 * Scripts and repair tooling (tsx, no Next runtime) still call `processTurn`
 * directly; they run turns on purpose, outside any request path.
 */
import type { Db } from "mongodb";
import { randomUUID } from "node:crypto";

type Env = Record<string, string | undefined>;

/** Set by scripts/turn-worker.ts on itself, never by configuration. */
export const TURN_WORKER_PROCESS_FLAG = "AHD_TURN_WORKER_PROCESS";

/** A worker that has not written for this long is treated as offline. */
export const TURN_WORKER_HEARTBEAT_STALE_MS = 90_000;

/** How often the worker writes its heartbeat and looks for a request. */
export const TURN_WORKER_TICK_MS = 5_000;

export const TURN_WORKER_CONTROL_ID = "current";

export interface TurnRequest {
  id: string;
  count: number;
  requestedBy: string;
  requestedAt: Date;
  claimedAt: Date | null;
  completedAt: Date | null;
  completed: number;
  outcome: "succeeded" | "failed" | null;
  message: string | null;
}

export interface TurnWorkerControl {
  _id: typeof TURN_WORKER_CONTROL_ID;
  heartbeatAt?: Date;
  workerStartedAt?: Date;
  workerBuild?: string | null;
  request?: TurnRequest | null;
}

export function turnsOwnedByWorker(env: Env): boolean {
  return env.CRON_OWNER === "worker";
}

export function markTurnWorkerProcess(env: Env): void {
  env[TURN_WORKER_PROCESS_FLAG] = "1";
}

export function isTurnWorkerProcess(env: Env): boolean {
  return env[TURN_WORKER_PROCESS_FLAG] === "1";
}

/**
 * Why this process must not run a turn, or null when it may.
 *
 * Only the Next.js server is refused: it is the process serving players. Next
 * sets NEXT_RUNTIME in every server bundle; the worker and one-off scripts run
 * under tsx without it.
 */
export function inProcessTurnRefusal(env: Env): string | null {
  if (!turnsOwnedByWorker(env)) return null;
  if (isTurnWorkerProcess(env)) return null;
  if (!env.NEXT_RUNTIME) return null;
  return (
    "Turns run in the turn worker (CRON_OWNER=worker). The web server will not run one, " +
    "because a turn blocks every player request until it finishes."
  );
}

export function isTurnWorkerOnline(heartbeatAt: Date | null | undefined, now: Date): boolean {
  if (!heartbeatAt) return false;
  return now.getTime() - new Date(heartbeatAt).getTime() <= TURN_WORKER_HEARTBEAT_STALE_MS;
}

export function isOpenRequest(request: TurnRequest | null | undefined): request is TurnRequest {
  return !!request && request.completedAt === null;
}

const control = (db: Db) => db.collection<TurnWorkerControl>("turnWorkerControl");

export async function getTurnWorkerStatus(db: Db, now = new Date()) {
  const doc = await control(db).findOne({ _id: TURN_WORKER_CONTROL_ID });
  return {
    online: isTurnWorkerOnline(doc?.heartbeatAt, now),
    heartbeatAt: doc?.heartbeatAt ?? null,
    workerBuild: doc?.workerBuild ?? null,
    request: doc?.request ?? null,
  };
}

/**
 * Queue `count` turns for the worker. One open request at a time: a second
 * click while one is queued or running returns the open request instead.
 */
export async function requestTurns(
  db: Db,
  input: { count: number; requestedBy: string; now?: Date }
): Promise<{ ok: true; request: TurnRequest } | { ok: false; request: TurnRequest | null }> {
  const now = input.now ?? new Date();
  const request: TurnRequest = {
    id: randomUUID(),
    count: input.count,
    requestedBy: input.requestedBy,
    requestedAt: now,
    claimedAt: null,
    completedAt: null,
    completed: 0,
    outcome: null,
    message: null,
  };
  const res = await control(db).updateOne(
    {
      _id: TURN_WORKER_CONTROL_ID,
      $or: [
        { request: null },
        { request: { $exists: false } },
        { "request.completedAt": { $ne: null } },
      ],
    },
    { $set: { request } }
  );
  if (res.matchedCount === 1) return { ok: true, request };
  const doc = await control(db).findOne({ _id: TURN_WORKER_CONTROL_ID });
  return { ok: false, request: doc?.request ?? null };
}

export async function recordTurnWorkerHeartbeat(
  db: Db,
  input: { now?: Date; startedAt: Date; build: string | null }
): Promise<void> {
  await control(db).updateOne(
    { _id: TURN_WORKER_CONTROL_ID },
    {
      $set: {
        heartbeatAt: input.now ?? new Date(),
        workerStartedAt: input.startedAt,
        workerBuild: input.build,
      },
    },
    { upsert: true }
  );
}

/**
 * A request claimed by a worker that then died is closed as failed on the next
 * worker start, so it never blocks new requests. Its turns are not rerun here:
 * processTurn's own crash recovery owns an interrupted turn.
 */
export async function closeOrphanedTurnRequest(db: Db, now = new Date()): Promise<boolean> {
  const res = await control(db).updateOne(
    {
      _id: TURN_WORKER_CONTROL_ID,
      "request.claimedAt": { $ne: null },
      "request.completedAt": null,
    },
    {
      $set: {
        "request.completedAt": now,
        "request.outcome": "failed",
        "request.message": "The turn worker restarted while running this request.",
      },
    }
  );
  return res.modifiedCount === 1;
}

type TurnResult = { success: boolean; turn: number; message: string };

/**
 * One worker tick: heartbeat, then claim and run an open request if there is
 * one. Turns in a request run strictly one after another; a turn that does not
 * advance ends the request as failed with its message.
 */
export async function runTurnRequestTick(input: {
  db: Db;
  processTurn: () => Promise<TurnResult>;
  startedAt: Date;
  build: string | null;
  now?: () => Date;
}): Promise<TurnRequest | null> {
  const now = input.now ?? (() => new Date());
  await recordTurnWorkerHeartbeat(input.db, {
    now: now(),
    startedAt: input.startedAt,
    build: input.build,
  });

  // A scheduled turn already holds the lock: leave the request queued rather
  // than claim it and fail on the lock. A stale lock (dead holder) does not
  // block; processTurn's own recovery takes it over.
  const gs = await input.db
    .collection<{ _id: string; isProcessing?: boolean; processingHeartbeatAt?: Date | null }>(
      "gameState"
    )
    .findOne({ _id: "current" }, { projection: { isProcessing: 1, processingHeartbeatAt: 1 } });
  const lockHeartbeat = gs?.processingHeartbeatAt
    ? new Date(gs.processingHeartbeatAt).getTime()
    : 0;
  if (
    gs?.isProcessing === true &&
    now().getTime() - lockHeartbeat <= TURN_WORKER_HEARTBEAT_STALE_MS
  ) {
    return null;
  }

  const claimed = await control(input.db).findOneAndUpdate(
    { _id: TURN_WORKER_CONTROL_ID, "request.claimedAt": null, "request.completedAt": null },
    { $set: { "request.claimedAt": now() } },
    { returnDocument: "after" }
  );
  const request = claimed?.request;
  if (!request) return null;

  let outcome: TurnRequest["outcome"] = "succeeded";
  let message = `Ran ${request.count} turn(s).`;
  let completed = 0;
  for (let i = 0; i < request.count; i++) {
    let result: TurnResult;
    try {
      result = await input.processTurn();
    } catch (error) {
      result = {
        success: false,
        turn: 0,
        message: error instanceof Error ? error.message : String(error),
      };
    }
    if (result.turn === 0) {
      outcome = "failed";
      message = `Turn ${i + 1} of ${request.count} did not run: ${result.message}`;
      break;
    }
    completed = i + 1;
    await control(input.db).updateOne(
      { _id: TURN_WORKER_CONTROL_ID, "request.id": request.id },
      { $set: { "request.completed": completed } }
    );
    // Keep the heartbeat fresh between long turns so the admin panel does not
    // report a busy worker as offline.
    await recordTurnWorkerHeartbeat(input.db, {
      now: now(),
      startedAt: input.startedAt,
      build: input.build,
    });
  }

  const done = { ...request, completed, completedAt: now(), outcome, message };
  await control(input.db).updateOne(
    { _id: TURN_WORKER_CONTROL_ID, "request.id": request.id },
    {
      $set: {
        "request.completed": completed,
        "request.completedAt": done.completedAt,
        "request.outcome": outcome,
        "request.message": message,
      },
    }
  );
  return done;
}
