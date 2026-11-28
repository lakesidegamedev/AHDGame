import type { Db } from "mongodb";
import { boundSession, withSessionDb } from "@/lib/db/sessionDb";

/** A refused cancellation cannot commit its terminal claim or any refund prefix. */
export async function withShareCancellationTransaction<T extends { ok: boolean }>(
  db: Db,
  work: (transactionDb: Db) => Promise<T>
): Promise<T> {
  class Refused extends Error {
    constructor(readonly result: T) {
      super(
        "error" in result && typeof result.error === "string"
          ? result.error
          : "Cancellation refused"
      );
    }
  }
  try {
    return await withSessionDb(db, async (transactionDb) => {
      const result = await work(transactionDb);
      if (!result.ok) throw new Refused(result);
      return result;
    });
  } catch (error) {
    if (error instanceof Refused && !boundSession(db)) return error.result;
    throw error;
  }
}
