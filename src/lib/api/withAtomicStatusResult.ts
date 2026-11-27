import type { Db } from "mongodb";
import { withAtomicResult } from "@/lib/db/withAtomicResult";

/** Rejected domain replies roll back prepaid resources with their proposed outcome. */
export async function withAtomicStatusResult<T extends { status: number }>(
  db: Db,
  work: (db: Db) => Promise<T>
): Promise<T> {
  const outcome = await withAtomicResult(db, async (db) => {
    const result = await work(db);
    return { ok: result.status >= 200 && result.status < 300, result };
  });
  return outcome.result;
}
