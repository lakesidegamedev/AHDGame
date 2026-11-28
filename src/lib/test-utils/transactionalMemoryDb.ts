import { BSON, type ClientSession, type Db } from "mongodb";
import { createInMemoryDb } from "./inMemoryDb";

/** Serial rollback fixture for domain tests, not a Mongo isolation simulator. */
export function createTransactionalMemoryDb() {
  const memory = createInMemoryDb();
  let tail = Promise.resolve();
  const client = {
    writeConcern: { w: "majority" },
    startSession: () => {
      const session = {
        async withTransaction<T>(work: (active: ClientSession) => Promise<T>): Promise<T> {
          const prior = tail;
          let release = () => {};
          tail = new Promise<void>((resolve) => {
            release = resolve;
          });
          await prior;
          let before: Map<string, Uint8Array[]> | undefined;
          try {
            before = new Map(
              [...memory.collections].map(([name, collection]) => [
                name,
                collection.docs.map((document) => BSON.serialize(document)),
              ])
            );
            return await work(session as unknown as ClientSession);
          } catch (error) {
            if (before)
              for (const [name, collection] of memory.collections) {
                collection.docs.splice(
                  0,
                  collection.docs.length,
                  ...(before.get(name) ?? []).map((document) => BSON.deserialize(document))
                );
              }
            throw error;
          } finally {
            release();
          }
        },
        async endSession() {},
      };
      return session;
    },
  };
  const db = Object.assign(memory, { client }) as unknown as Db;
  return { db, memory };
}
