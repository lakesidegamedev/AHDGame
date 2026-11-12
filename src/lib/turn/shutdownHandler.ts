import * as Sentry from "@sentry/nextjs";
import { stopCronJobs } from "@/lib/cron";
import { releaseLocalProcessingLock } from "@/lib/turnSystem";
import { logger } from "../observability/logger";

/*
 * Graceful shutdown handler.
 *
 * Railway sends SIGTERM (then SIGKILL after a grace period) on redeploy. Without
 * a handler, a mid-turn redeploy strands `isProcessing = true` until the stale
 * takeover fires.
 *
 * On signal: stop cron, release this process's turn lock so the next container
 * picks up immediately, flush Sentry, exit. All time-bounded so we never
 * overstay the grace window.
 *
 * Use `prependOnceListener`, not `once`: Next's own start-server SIGTERM
 * cleanup ends in `process.exit(143)` and is registered before this module
 * loads, so a plain `once` would run after it and get killed mid-await,
 * stranding the lock. Prepending gets our Mongo release in flight first. Do NOT
 * set NEXT_MANUAL_SIG_HANDLE: it would suppress Next's drain and drop in-flight
 * requests.
 */

const CLEANUP_TIMEOUT_MS = 2500;
const FLUSH_TIMEOUT_MS = 2000;

let shuttingDown = false;

function withTimeout(promise: Promise<unknown>, ms: number): Promise<unknown> {
  return Promise.race([promise, new Promise((resolve) => setTimeout(resolve, ms))]);
}

export interface GracefulShutdownDeps {
  process?: NodeJS.Process;
  /** Injectable for tests; defaults to the real cron stopper. */
  stopCron?: () => void;
  /** Injectable for tests; defaults to the real lock release. */
  releaseLock?: (reason: string) => Promise<boolean>;
}

export function installGracefulShutdown(deps: GracefulShutdownDeps = {}): void {
  const proc = deps.process ?? process;
  const stopCron = deps.stopCron ?? stopCronJobs;
  const releaseLock = deps.releaseLock ?? releaseLocalProcessingLock;

  const handle = (signal: NodeJS.Signals): Promise<void> => {
    if (shuttingDown) return Promise.resolve();
    shuttingDown = true;
    console.log(`[shutdown] ${signal} received — stopping cron and releasing turn lock`);

    return (async () => {
      try {
        stopCron();
      } catch (err) {
        logger.error("shutdown", "stopCronJobs failed", err);
      }

      try {
        await withTimeout(releaseLock(signal), CLEANUP_TIMEOUT_MS);
      } catch (err) {
        logger.error("shutdown", "processing-lock release failed", err);
      }

      try {
        await Sentry.flush(FLUSH_TIMEOUT_MS);
      } catch {
        // Never let the Sentry flush hang the exit.
      }

      proc.exit(0);
    })();
  };

  // prependOnceListener, not once — see the ORDERING note above. The
  // `shuttingDown` guard already makes a repeat signal a no-op, so the
  // once-semantics are belt-and-braces.
  proc.prependOnceListener("SIGTERM", () => handle("SIGTERM"));
  proc.prependOnceListener("SIGINT", () => handle("SIGINT"));
}
