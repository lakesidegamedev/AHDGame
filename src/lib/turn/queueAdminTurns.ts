/**
 * Admin "process turn" / "batch" when the turn worker owns turns: queue the
 * turns for the worker and return at once, instead of running them inside this
 * request (see turnWorkerHandoff.ts for why).
 */
import { NextResponse } from "next/server";
import type { Db } from "mongodb";
import { errorResponse } from "@/lib/api/errors";
import type { GameState } from "@/lib/db/types";
import {
  getTurnWorkerStatus,
  isOpenRequest,
  requestTurns,
  TURN_WORKER_HEARTBEAT_STALE_MS,
} from "./turnWorkerHandoff";

export async function queueAdminTurns(
  db: Db,
  input: { count: number; requestedBy: string; now?: Date }
): Promise<NextResponse> {
  const now = input.now ?? new Date();
  const status = await getTurnWorkerStatus(db, now);

  if (isOpenRequest(status.request)) {
    const r = status.request;
    return errorResponse(
      409,
      `A turn request is already ${r.claimedAt ? "running" : "queued"} (${r.completed} of ${r.count} done).`,
      { code: "TURN_REQUEST_OPEN", extra: { request: r } }
    );
  }

  // A worker deep in a CPU-heavy turn can miss heartbeats; a fresh turn-lock
  // heartbeat means it is alive and busy, not gone.
  let online = status.online;
  if (!online) {
    const gs = await db
      .collection<GameState>("gameState")
      .findOne({ _id: "current" }, { projection: { isProcessing: 1, processingHeartbeatAt: 1 } });
    const hb = gs?.processingHeartbeatAt ? new Date(gs.processingHeartbeatAt).getTime() : 0;
    online = gs?.isProcessing === true && now.getTime() - hb <= TURN_WORKER_HEARTBEAT_STALE_MS;
  }
  if (!online) {
    const last = status.heartbeatAt ? new Date(status.heartbeatAt).toISOString() : "never";
    return errorResponse(
      503,
      `The turn worker is offline (last heartbeat: ${last}). Turns never run in the web server; ` +
        "start the turn worker and try again.",
      { code: "TURN_WORKER_OFFLINE" }
    );
  }

  const queued = await requestTurns(db, {
    count: input.count,
    requestedBy: input.requestedBy,
    now,
  });
  if (!queued.ok) {
    return errorResponse(409, "Another turn request was queued at the same moment.", {
      code: "TURN_REQUEST_OPEN",
      extra: { request: queued.request },
    });
  }
  return NextResponse.json(
    {
      success: true,
      queued: true,
      request: queued.request,
      message:
        input.count === 1
          ? "Queued for the turn worker. It starts within a few seconds; progress shows below."
          : `Queued ${input.count} turns for the turn worker. They run one after another; progress shows below.`,
    },
    { status: 202 }
  );
}
