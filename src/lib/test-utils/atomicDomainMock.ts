import { BSON } from "mongodb";
import type { Db } from "mongodb";
import type { InMemoryDb } from "./inMemoryDb";

type FixtureState = Partial<InMemoryDb> & { captureRollback?: () => () => void };
function isFixtureState(value: object): value is FixtureState {
  return (
    (!("collections" in value) || value.collections instanceof Map) &&
    (!("captureRollback" in value) || typeof value.captureRollback === "function")
  );
}

/** Model serialized commit/rollback while keeping unit fixtures independent of a server. */
export function atomicDomainMock() {
  const tails = new WeakMap<object, Promise<unknown>>();
  const effects = new WeakMap<object, Array<() => Promise<unknown>>>();
  return {
    unboundDb: (db: Db) => db,
    boundSession: (db: Db) =>
      effects.has(db) ? ({} as import("mongodb").ClientSession) : undefined,
    runWithDbSession: async <T>(
      _db: Db,
      work: (session: import("mongodb").ClientSession) => Promise<T>
    ) => work({} as import("mongodb").ClientSession),
    afterCommit: async (db: Db, effect: () => Promise<unknown>) => {
      const queued = effects.get(db);
      if (queued) queued.push(effect);
      else await effect();
    },
    withSessionDb: async <T>(db: Db, work: (tx: Db) => Promise<T>) => {
      if (effects.has(db)) return work(db);
      const state: FixtureState = isFixtureState(db) ? db : {};
      const next = (tails.get(db) ?? Promise.resolve()).then(async () => {
        const restore = state.captureRollback?.();
        const before = new Map(
          [...(state.collections ?? [])].map(([name, col]) => [
            name,
            BSON.EJSON.parse(BSON.EJSON.stringify(col.docs)) as Record<string, unknown>[],
          ])
        );
        const queued: Array<() => Promise<unknown>> = [];
        const tx = new Proxy(db, {});
        effects.set(tx, queued);
        let result: T;
        try {
          result = await work(tx);
        } catch (error) {
          restore?.();
          for (const [name, col] of state.collections ?? []) col.docs = before.get(name) ?? [];
          throw error;
        } finally {
          effects.delete(tx);
        }
        for (const effect of queued) await effect();
        return result;
      });
      tails.set(
        db,
        next.catch(() => undefined)
      );
      return next;
    },
  };
}
