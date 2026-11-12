import type { ClientSession } from "mongodb";
import { assertTransactionSupportAtBoot } from "@/lib/db/transactionSupport";

/**
 * Mongo error code 117 (`ConflictingOperationInProgress`). Despite the
 * sharded-cluster wording it fires on replica sets too: the driver hands out
 * a pooled session whose transaction counter is ahead of the server's,
 * typically a session that survived a failed or aborted transaction. Retrying
 * on a FRESH session succeeds, but the error carries no
 * `TransientTransactionError` label, so `withTransaction`'s built-in retry
 * never runs.
 *
 * NOT every 117 is transient. The same code also fires when OUR code issues
 * concurrent operations on ONE session (a `Promise.all` of session-bound
 * reads): each racer sends `startTransaction` at the same txnNumber and every
 * loser is rejected. That variant is a call-pattern bug; retrying re-runs the
 * race. Check the call site for concurrent session use before assuming a
 * stale session.
 */
const MONGO_CONFLICTING_OPERATION_IN_PROGRESS = 117;

const DEFAULT_MAX_ATTEMPTS = 4;
const RETRY_BASE_DELAY_MS = 50;

export interface RunTransactionOptions {
  maxAttempts?: number;
  sleep?: (ms: number) => Promise<void>;
  onRetry?: (attempt: number, error: unknown) => void;
  /** Called once when the body is run WITHOUT a transaction (standalone Mongo). */
  onNonAtomic?: () => void;
}

function isConflictingOperationInProgress(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  return (error as { code?: unknown }).code === MONGO_CONFLICTING_OPERATION_IN_PROGRESS;
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Run `run(session)` inside a multi-document transaction, retrying
 * `ConflictingOperationInProgress` (code 117) with a brand-new session each
 * attempt; only a fresh session clears the poisoned transaction counter.
 * Mongo's built-in retry lacks the transient label for this error, so pooled
 * stale sessions surface raw `MongoServerError` 500s. All other errors
 * propagate immediately, and every session is ended.
 *
 * STANDALONE FALLBACK. Standalone deployments reject transactions, so topology
 * is probed first; the body then receives no session and callers must handle
 * partial writes themselves (compare-and-set guards do not make multi-document
 * operations atomic). The probe is the ONLY thing selecting the sequential
 * path: a transaction that fails once started is never re-run, because
 * `withTransaction` can fail at commit with the body's writes applied, and
 * retrying sequentially would double-apply them.
 */
export async function runTransactionWithSessionRetry<T>(
  getMongoClient: () => Promise<{ startSession: () => ClientSession }>,
  run: (session?: ClientSession) => Promise<T>,
  options: RunTransactionOptions = {}
): Promise<T> {
  const maxAttempts = options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  const sleep = options.sleep ?? defaultSleep;

  let transactionsSupported = true;
  try {
    transactionsSupported = await assertTransactionSupportAtBoot();
  } catch {
    // The topology probe itself is unavailable, so preserve the previous
    // behaviour and attempt the transaction.
    transactionsSupported = true;
  }
  // Deliberately OUTSIDE the probe's try: an error raised by the body must
  // propagate to the caller, not get swallowed and re-run as a transaction.
  if (!transactionsSupported) {
    options.onNonAtomic?.();
    return run(undefined);
  }

  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const client = await getMongoClient();
    const session = client.startSession();
    try {
      return await session.withTransaction(() => run(session));
    } catch (error) {
      lastError = error;
      // Deliberately NOT retried sequentially. `withTransaction` may fail at
      // COMMIT, after the body has already written, so re-running it here could
      // double-apply every write. The upfront probe is what decides the
      // sequential path; by this point the only safe move is to surface it.
      if (!isConflictingOperationInProgress(error) || attempt === maxAttempts) {
        throw error;
      }
      options.onRetry?.(attempt, error);
      await sleep(RETRY_BASE_DELAY_MS * attempt);
    } finally {
      await session.endSession();
    }
  }
  throw lastError;
}
