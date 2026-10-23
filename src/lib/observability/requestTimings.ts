/**
 * Bounded sample of API request timings, persisted for support diagnosis.
 *
 * The routes that log a per-request timing summary (for example
 * `[action-request-timing]`) also keep the slowest and a small random share of
 * the rest in Mongo. Production stdout is not readable by support, so a
 * read-only query against the single `diagnostics/apiRequestTimings` document
 * is the only way to see real latency. Samples hold timings only: no usernames,
 * user ids, character ids, IPs or request bodies.
 *
 * Writing is fire-and-forget. Diagnostics must never delay, fail or otherwise
 * change a response, so every failure is swallowed and the database handle is
 * opened lazily (routes can return before the db was ever touched).
 */
import { getDb } from "@/lib/mongodb";

const COLLECTION = "diagnostics";
const DOCUMENT_ID = "apiRequestTimings";

/** Requests at or above this duration are always kept. */
export const SLOW_REQUEST_MS = 1000;

/** Share of the remaining (fast) requests kept, so normal traffic is visible. */
export const REQUEST_SAMPLE_RATE = 0.05;

/** Samples kept per document; the oldest fall off the front of the array. */
export const MAX_SAMPLES = 60;

export type ApiRequestTimingResult = "success" | "rejected" | "error";

interface RequestTimingDocument {
  _id: string;
  samples: ApiRequestTimingSample[];
  updatedAt: Date;
}

export interface ApiRequestTimingSample {
  at: Date;
  route: string;
  durationMs: number;
  status: number;
  result: ApiRequestTimingResult;
  stages: Record<string, number>;
  actionType?: string;
  requestedCount?: number;
}

/**
 * Persist one timing sample when it is slow or randomly sampled. Resolves
 * without writing otherwise, and never rejects.
 */
export async function recordApiRequestTiming(
  sample: ApiRequestTimingSample,
  options: { rng?: () => number } = {}
): Promise<void> {
  try {
    const rng = options.rng ?? Math.random;
    if (sample.durationMs < SLOW_REQUEST_MS && rng() >= REQUEST_SAMPLE_RATE) return;

    const db = await getDb();
    await db.collection<RequestTimingDocument>(COLLECTION).updateOne(
      { _id: DOCUMENT_ID },
      {
        $push: { samples: { $each: [sample], $slice: -MAX_SAMPLES } },
        $set: { updatedAt: sample.at },
      },
      { upsert: true }
    );
  } catch {
    // Diagnostics are best effort; a failed write must not surface anywhere.
  }
}

/** Fire-and-forget wrapper for route handlers: one line, no unhandled rejection. */
export function recordApiRequestTimingSafely(sample: ApiRequestTimingSample): void {
  void recordApiRequestTiming(sample).catch(() => {});
}
