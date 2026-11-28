import type { Db } from "mongodb";
import { boundSession, withSessionDb } from "./sessionDb";

export class AtomicResultRefused<T extends { ok: boolean }> extends Error {
  constructor(readonly result: T) {
    super("Domain command refused");
  }
}

/** A declined domain command must not commit resource consumption or effects. */
export async function withAtomicResult<T extends { ok: boolean }>(
  db: Db,
  work: (transactionDb: Db) => Promise<T>
): Promise<T> {
  try {
    return await withSessionDb(db, async (transactionDb) => {
      const result = await work(transactionDb);
      if (!result.ok) throw new AtomicResultRefused(result);
      return result;
    });
  } catch (error) {
    if (error instanceof AtomicResultRefused && !boundSession(db)) return error.result as T;
    throw error;
  }
}
