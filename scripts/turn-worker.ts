/**
 * The turn worker: the game's schedule, in a process that web deploys do not restart.
 *
 * Turns run in-process inside the Next.js server, driven by `instrumentation.ts` ->
 * `initializeCronJobs()`. Railway replaces the container on every web deploy, and a
 * SIGTERM mid-turn kills whatever turn is running. On 2026-09-06 four deploys inside
 * fifty minutes killed turn 673 partway through and cost the world that slot; nothing
 * in Railway is turn-aware, so nothing prevents it.
 *
 * Running the schedule here instead means a web deploy cannot touch a turn at all. It
 * is the only one of the four mitigations that makes that statement true rather than
 * cheaper: the crash-recovery and resume work reduce what an interrupted turn costs,
 * this removes the interruption.
 *
 * DEPLOY SHAPE
 *
 * A second Railway service off the same repo and the same MONGODB_URI, started with:
 *
 *     CRON_OWNER=worker npx tsx scripts/turn-worker.ts
 *
 * and the WEB service given `CRON_OWNER=worker` as well, which is what makes
 * `shouldRunCronInWebProcess` return false there. Deploy the worker rarely; deploy web
 * as often as you like.
 *
 * The switch is opt-OUT for web on purpose. If this worker is misconfigured and never
 * starts, an unset variable leaves web running turns exactly as it does today, rather
 * than leaving a world with no turns at all.
 *
 * ONE OWNER AT A TIME is not enforced here and does not need to be: `processTurn`
 * takes the `gameState` processing lock before doing anything, so a window where both
 * web and worker have cron running is safe. The second one to fire logs "Skipping,
 * another turn is already processing" and returns. That is what makes the cutover
 * boring: set the variable on the worker first, confirm it is taking turns, then set
 * it on web.
 */
import { isCronWorkerProcess } from "@/lib/startupMode";
import { markTurnWorkerProcess, TURN_WORKER_TICK_MS } from "@/lib/turn/turnWorkerHandoff";

const SHUTDOWN_TIMEOUT_MS = 2500;
/** The prod worker container stops after 30s; leave room for the lock release. */
const DEFERRED_WORK_SHUTDOWN_MS = 25_000;

async function main(): Promise<void> {
  if (!isCronWorkerProcess(process.env)) {
    console.error(
      "[turn-worker] refusing to start without CRON_OWNER=worker. Web decides whether to " +
        "run its own cron by reading the same variable, so starting without it would give " +
        "the world two schedulers and no record of which is which."
    );
    process.exit(1);
  }
  // Turn phases run long aggregations; the web default (60s, one driver retry)
  // aborted turn 373's bankingTurn at ~120s under disk contention. Set before
  // anything opens the Mongo client. An explicit deployment value still wins.
  process.env.MONGODB_SOCKET_TIMEOUT_MS ||= String(5 * 60_000);
  // The only process allowed to run a turn while CRON_OWNER=worker. processTurn
  // refuses inside the web server; see turnWorkerHandoff.ts.
  markTurnWorkerProcess(process.env);

  // Unlike next start, this entry point does not run instrumentation.ts.
  // Initialize the same error and memory reporting before loading the cron
  // graph so failed worker boots and missed turns are observable.
  process.env.SENTRY_RELEASE ||= process.env.RAILWAY_GIT_COMMIT_SHA || "unknown";
  await import("../sentry.server.config");
  const { installCrashCapture } = await import("@/lib/observability/crashCapture");
  installCrashCapture();
  if (process.env.NODE_ENV === "production") {
    const { startHeapWatchdog } = await import("@/lib/observability/heapWatchdog");
    startHeapWatchdog({
      rssCapBytes: Number(process.env.HEAP_WATCHDOG_RSS_CAP_BYTES) || 5_000_000_000,
    });
  }

  try {
    const { getDb } = await import("@/lib/mongodb");
    const { checkPersistedSectorTypes } =
      await import("@/lib/corporations/checkPersistedSectorTypes");
    await checkPersistedSectorTypes(await getDb());
  } catch (err) {
    console.error("[sector-types] startup check failed:", err);
  }

  const { initializeCronJobs, stopCronJobs } = await import("@/lib/cron");
  const { releaseLocalProcessingLock } = await import("@/lib/turnSystem");
  console.log("[turn-worker] starting; this process owns the cron schedule");
  await initializeCronJobs();
  console.log("[turn-worker] cron initialized, waiting for the clock");

  // Admin-requested turns: the web server queues them, this process runs them.
  const { getDb: getHandoffDb } = await import("@/lib/mongodb");
  const { processTurn } = await import("@/lib/turnSystem");
  const { closeOrphanedTurnRequest, recordTurnWorkerHeartbeat, runTurnRequestTick } =
    await import("@/lib/turn/turnWorkerHandoff");
  const startedAt = new Date();
  const build = process.env.BUILD_GIT_COMMIT_SHA || process.env.RAILWAY_GIT_COMMIT_SHA || null;
  try {
    if (await closeOrphanedTurnRequest(await getHandoffDb())) {
      console.warn("[turn-worker] closed a turn request left open by a previous worker");
    }
  } catch (err) {
    console.error("[turn-worker] could not check for an orphaned turn request:", err);
  }
  let handlingRequest = false;
  setInterval(() => {
    void (async () => {
      try {
        const db = await getHandoffDb();
        if (handlingRequest) {
          await recordTurnWorkerHeartbeat(db, { startedAt, build });
          return;
        }
        handlingRequest = true;
        try {
          const done = await runTurnRequestTick({ db, processTurn, startedAt, build });
          if (done) {
            console.log(
              `[turn-worker] turn request ${done.id} by ${done.requestedBy}: ${done.outcome}, ` +
                `${done.completed}/${done.count}. ${done.message ?? ""}`
            );
          }
        } finally {
          handlingRequest = false;
        }
      } catch (err) {
        console.error("[turn-worker] turn request tick failed:", err);
      }
    })();
  }, TURN_WORKER_TICK_MS);

  const shutdown = async (signal: NodeJS.Signals) => {
    console.log(`[turn-worker] ${signal} received, stopping cron and releasing any turn lock`);
    try {
      stopCronJobs();
    } catch (err) {
      console.error("[turn-worker] stopCronJobs failed:", err);
    }
    try {
      // Same release the web server performs: it marks an interrupted turn abandoned
      // rather than clearing it, so the next tick resumes instead of re-running and
      // double-applying. See releaseLocalProcessingLock.
      await Promise.race([
        releaseLocalProcessingLock(signal),
        new Promise((resolve) => setTimeout(resolve, SHUTDOWN_TIMEOUT_MS)),
      ]);
    } catch (err) {
      console.error("[turn-worker] lock release failed:", err);
    }
    // Post-turn telemetry (the producer-market shadow) gets what is left of
    // the container's stop timeout. Losing it only starts a new shadow run.
    const { drainDeferredTurnWorkWithin, pendingDeferredTurnWork } =
      await import("@/lib/turn/deferredTurnWork");
    if (pendingDeferredTurnWork() > 0) {
      const finished = await drainDeferredTurnWorkWithin(DEFERRED_WORK_SHUTDOWN_MS);
      console.log(`[turn-worker] deferred turn work ${finished ? "finished" : "abandoned"}`);
    }
    process.exit(0);
  };

  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);

  // node-cron holds the loop open; this keeps intent explicit for a reader.
  setInterval(() => {}, 1 << 30);
}

main().catch((err) => {
  console.error("[turn-worker] fatal:", err);
  process.exit(1);
});
