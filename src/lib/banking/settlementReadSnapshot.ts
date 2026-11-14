/** Phase-local receipt metadata avoids repeat reads; generation guards remain authoritative. */
import { AsyncLocalStorage } from "node:async_hooks";
import type { Db } from "mongodb";

type Protocol = "cash" | "projection";
interface Snapshot {
  epoch: number;
  targets: WeakMap<Db, Map<string, { epoch: number; value: unknown }>>;
}
const snapshots = new AsyncLocalStorage<Snapshot>();
const keyFor = (protocol: Protocol, collection: string, id: unknown) =>
  `${protocol}:${collection}:${typeof id}:${String(id)}`;

export function withSettlementReadSnapshot<T>(work: () => Promise<T>): Promise<T> {
  return snapshots.run({ epoch: 0, targets: new WeakMap() }, work);
}

export function settlementReadEpoch(): number | undefined {
  return snapshots.getStore()?.epoch;
}

export function settlementTargetSnapshot<T>(
  db: Db,
  protocol: Protocol,
  collection: string,
  id: unknown
): { epoch: number; value: T } | undefined {
  return snapshots
    .getStore()
    ?.targets.get(db)
    ?.get(keyFor(protocol, collection, id)) as { epoch: number; value: T } | undefined;
}

export function rememberSettlementTarget<T>(
  db: Db,
  protocol: Protocol,
  collection: string,
  id: unknown,
  value: T
): void {
  const snapshot = snapshots.getStore();
  if (!snapshot) return;
  let targets = snapshot.targets.get(db);
  if (!targets) {
    targets = new Map();
    snapshot.targets.set(db, targets);
  }
  targets.set(keyFor(protocol, collection, id), { epoch: ++snapshot.epoch, value });
}

export function forgetSettlementTarget(
  db: Db,
  protocol: Protocol,
  collection: string,
  id: unknown
): void {
  snapshots
    .getStore()
    ?.targets.get(db)
    ?.delete(keyFor(protocol, collection, id));
}
