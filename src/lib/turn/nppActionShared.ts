/** Helpers shared by the NPP action sweeps. */
import type { CountryId } from "@/lib/constants/countries";

// Optional global salt so headless sim runs can vary the NPP action RNG across
// runs while staying reproducible within a run (set by the sim harness).
export const NPP_ACTION_RNG_SALT = process.env.SIM_RNG_SALT ? `:${process.env.SIM_RNG_SALT}` : "";

// v3 = non-player-only autonomy, v4 = global; see the econActive/econGlobal
// gate in processNppActions. The ordering is the canonical export from
// nppAutonomy/featureFlag.

/** Mongo filter fragment restricting a query to the autonomy country scope. */
export function countryScopeFilter(scope: CountryId[] | null): Record<string, unknown> {
  return scope ? { countryId: { $in: scope } } : {};
}

/** Partitions (countries, currencies) whose sweep work runs at once. */
export const NPP_SWEEP_PARTITION_CONCURRENCY = 8;

/** Group items by key, keeping both first-seen key order and item order. */
export function groupInOrder<T>(items: readonly T[], keyOf: (item: T) => string): T[][] {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const key = keyOf(item);
    const group = groups.get(key);
    if (group) group.push(item);
    else groups.set(key, [item]);
  }
  return [...groups.values()];
}
