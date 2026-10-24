import { createHash } from "node:crypto";
import { ObjectId } from "mongodb";
import type { EconomyResetPlan } from "./types";

/** sha256 of the plan JSON. The plan builder fixes key and list order. */
export function economyResetPlanDigest(plan: EconomyResetPlan): string {
  return createHash("sha256").update(JSON.stringify(plan)).digest("hex");
}

/**
 * Stable ObjectId for a document the reset writes, derived from the plan
 * digest and a key. A retried phase upserts the same ids instead of writing
 * duplicates.
 */
export function economyResetObjectId(digest: string, key: string): ObjectId {
  return new ObjectId(createHash("sha256").update(`${digest}:${key}`).digest("hex").slice(0, 24));
}
