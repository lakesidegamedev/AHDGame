/**
 * Stores the approved economy reset plan so a failed apply can resume.
 *
 * A real-size world's plan is tens of megabytes (every account's opening
 * balance and every character's endowment), above the 16 MB BSON document
 * limit. The plan's JSON is split into chunk documents
 * `{ _id: "<digest>:<index>", digest, index, total, data }`, each far under
 * the limit, and reassembly refuses unless every chunk is present and the
 * rebuilt plan hashes to the approved digest.
 */
import type { Db } from "mongodb";
import { economyResetPlanDigest } from "./digest";
import { ECONOMY_RESET_PLANS_COLLECTION, type EconomyResetPlan } from "./types";

/**
 * Characters per chunk. A UTF-8 character is at most 4 bytes, so a chunk is at
 * most 8 MB even if every character were multi-byte; the plan is almost all
 * ASCII, so a chunk is about 2 MB in practice.
 */
const PLAN_CHUNK_CHARS = 2_000_000;

export interface EconomyResetPlanChunk {
  _id: string;
  digest: string;
  index: number;
  total: number;
  data: string;
  createdAt: Date;
}

/** Split a plan's JSON into ordered chunks. */
export function splitPlanJson(json: string, chunkChars = PLAN_CHUNK_CHARS): string[] {
  if (chunkChars <= 0) throw new Error("Chunk size must be positive");
  const out: string[] = [];
  for (let i = 0; i < json.length; i += chunkChars) out.push(json.slice(i, i + chunkChars));
  return out.length > 0 ? out : [""];
}

/**
 * Rebuild a plan from its chunks. Throws when a chunk is missing, duplicated,
 * from another digest, or when the rebuilt plan does not hash to the digest.
 */
export function joinPlanChunks(
  digest: string,
  chunks: Pick<EconomyResetPlanChunk, "digest" | "index" | "total" | "data">[]
): EconomyResetPlan {
  if (chunks.length === 0) throw new Error("The approved economy reset plan is not stored");
  const total = chunks[0].total;
  const ordered = [...chunks].sort((a, b) => a.index - b.index);
  if (
    ordered.length !== total ||
    ordered.some(
      (chunk, i) => chunk.index !== i || chunk.total !== total || chunk.digest !== digest
    )
  )
    throw new Error("The stored economy reset plan is incomplete; re-run the census");
  const plan = JSON.parse(ordered.map((chunk) => chunk.data).join("")) as EconomyResetPlan;
  if (economyResetPlanDigest(plan) !== digest)
    throw new Error("The stored economy reset plan does not match its digest; re-run the census");
  return plan;
}

/** Store the plan idempotently: a retry upserts the same chunk ids with the same data. */
export async function storeEconomyResetPlan(
  db: Db,
  digest: string,
  plan: EconomyResetPlan,
  createdAt: Date
): Promise<number> {
  const parts = splitPlanJson(JSON.stringify(plan));
  const collection = db.collection<EconomyResetPlanChunk>(ECONOMY_RESET_PLANS_COLLECTION);
  // One chunk per write keeps every command far under the wire limit too.
  for (const [index, data] of parts.entries())
    await collection.updateOne(
      { _id: `${digest}:${index}` },
      {
        $setOnInsert: { digest, index, total: parts.length, data, createdAt },
      },
      { upsert: true }
    );
  return parts.length;
}

export async function loadEconomyResetPlan(db: Db, digest: string): Promise<EconomyResetPlan> {
  const chunks = await db
    .collection<EconomyResetPlanChunk>(ECONOMY_RESET_PLANS_COLLECTION)
    .find({ digest })
    .sort({ index: 1 })
    .toArray();
  return joinPlanChunks(digest, chunks);
}
