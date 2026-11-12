import type { ObjectId } from "mongodb";

/**
 * Per-corporation in-process serialization for money-mutating operations.
 *
 * Cash mutations outside turn processing (bond issuance, hostile takeover,
 * share trades, sector buys) are multi-step and not wrapped in a DB
 * transaction: single-node rs0 has no multi-doc txns. Two large cash ops on
 * the same corp can interleave read-then-write and silently lose money.
 * Serializing per-corp removes that interleave.
 *
 * In-process only: does not serialize across horizontally-scaled instances.
 * The durable cross-instance fix is multi-doc transactions or a DB advisory
 * lock.
 *
 * Deadlock safety: acquire at most ONE corp lock per operation and never nest
 * a second acquisition inside `fn`.
 */

// key = corp id string → tail of the pending-operation chain for that corp.
const chains = new Map<string, Promise<void>>();

/**
 * Run `fn` with exclusive access to `corpId`'s money-mutation slot. Operations
 * for the same corp run strictly in call order; different corps run in parallel.
 * `fn`'s resolution/rejection is returned to the caller unchanged; a rejection
 * does not poison the queue (the next waiter still runs).
 */
export async function withCorpLock<T>(corpId: ObjectId | string, fn: () => Promise<T>): Promise<T> {
  const key = corpId.toString();
  const prior = chains.get(key) ?? Promise.resolve();

  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });

  // The next op for this corp waits on our gate (which resolves when we finish,
  // regardless of outcome). This `mine` is the new tail of the chain.
  const mine = prior.then(() => gate);
  chains.set(key, mine);

  // Wait for the prior holder to finish; swallow its error so ordering holds.
  await prior.catch(() => {});

  try {
    return await fn();
  } finally {
    release();
    // If nobody chained after us, we're still the tail — drop the key so the
    // map doesn't retain resolved promises forever.
    if (chains.get(key) === mine) chains.delete(key);
  }
}
