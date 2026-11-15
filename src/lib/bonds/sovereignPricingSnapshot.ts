/** Sovereign pricing shares stable political readings within a bond phase. */
import { AsyncLocalStorage } from "node:async_hooks";
import type { Db } from "mongodb";

interface PricingSnapshot {
  spreads: WeakMap<Db, Map<string, Promise<number>>>;
}
const snapshots = new AsyncLocalStorage<PricingSnapshot>();

export function withSovereignPricingSnapshot<T>(work: () => Promise<T>): Promise<T> {
  return snapshots.run({ spreads: new WeakMap() }, work);
}

export function invalidateSovereignPricingSnapshot(): void {
  const snapshot = snapshots.getStore();
  if (snapshot) snapshot.spreads = new WeakMap();
}

export function democraticSpreadSnapshot(
  db: Db,
  country: string,
  load: () => Promise<number>
): Promise<number> {
  const snapshot = snapshots.getStore();
  if (!snapshot) return load();
  let byCountry = snapshot.spreads.get(db);
  if (!byCountry) {
    byCountry = new Map();
    snapshot.spreads.set(db, byCountry);
  }
  let value = byCountry.get(country);
  if (!value) {
    value = load();
    byCountry.set(country, value);
  }
  return value;
}
