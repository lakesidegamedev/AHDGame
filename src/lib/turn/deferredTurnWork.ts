/**
 * Work a turn phase hands off to run after the turn, off its critical path.
 *
 * Only for telemetry and other work no later phase, player or turn reads
 * during the turn that queued it. The turn runner drains the queue after it
 * releases the turn lock; a phase that needs the previous turn's deferred
 * output drains it first, so ordering across turns holds even if a drain was
 * missed. A failed job is logged and dropped, never retried.
 */

type DeferredJob = { label: string; run: () => Promise<void> };

const queue: DeferredJob[] = [];
let draining: Promise<void> | null = null;

export function deferAfterTurn(label: string, run: () => Promise<void>): void {
  queue.push({ label, run });
}

export function pendingDeferredTurnWork(): number {
  return queue.length + (draining ? 1 : 0);
}

/** Run every queued job in order. Concurrent callers share one drain. */
export function drainDeferredTurnWork(): Promise<void> {
  if (draining) return draining;
  if (queue.length === 0) return Promise.resolve();
  draining = (async () => {
    while (queue.length > 0) {
      const job = queue.shift()!;
      const started = Date.now();
      try {
        await job.run();
        console.log(`[deferredTurnWork] ${job.label} finished in ${Date.now() - started}ms`);
      } catch (error) {
        console.warn(`[deferredTurnWork] ${job.label} failed:`, error);
      }
    }
  })().finally(() => {
    draining = null;
  });
  return draining;
}

/** Wait for queued work, but never longer than `timeoutMs` (shutdown). */
export async function drainDeferredTurnWorkWithin(timeoutMs: number): Promise<boolean> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const finished = await Promise.race([
    drainDeferredTurnWork().then(() => true),
    new Promise<boolean>((resolve) => {
      timer = setTimeout(() => resolve(false), timeoutMs);
    }),
  ]);
  if (timer) clearTimeout(timer);
  return finished;
}
