import { createHash } from "node:crypto";
import { gunzipSync, gzipSync } from "node:zlib";
import { BSON, type Db, type Document } from "mongodb";
import { corporationTurnJournalCollection } from "@/lib/db/repositories/corporationTurnJournal";
import { producerEconomyTurnsCollection } from "@/lib/db/repositories/producerEconomyTurns";
import type { FundedClosingContinuation } from "../corporationTurnPayouts";
import { decodeOutput, encodeOutput, isStorableOutput } from "./rules";

const VERSION = 1;
const CHUNK_BYTES = 3 * 1024 * 1024;
const MAX_BYTES = 256 * 1024 * 1024;

interface Scope {
  worldEpoch: string;
  turn: number;
}

interface MarketMarker extends Scope {
  _id: string;
  status: "frozen" | "settled";
  digest: string;
}

interface PlanManifest extends Scope {
  _id: string;
  kind: "fundedClosingManifest";
  version: number;
  marketDigest: string;
  hash: string;
  chunkCount: number;
}

interface PlanChunk {
  _id: string;
  kind: "fundedClosingChunk";
  turn: number;
  payload: string;
}

interface PlanEnvelope extends Scope {
  version: number;
  marketDigest: string;
  continuation: FundedClosingContinuation;
}

const keyOf = ({ worldEpoch, turn }: Scope) => JSON.stringify([worldEpoch, turn]);
const manifestId = (scope: Scope) => `fundedClosing:${keyOf(scope)}`;
const chunkId = (id: string, hash: string, index: number) => `${id}:${hash}:${index}`;
const hashOf = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");

export class FundedClosingPlanError extends Error {
  constructor(detail: string, cause?: unknown) {
    super(`Funded corporation closing plan ${detail}; manual recovery required`, { cause });
  }
}

async function readMarketMarker(db: Db, scope: Scope) {
  const market = await producerEconomyTurnsCollection<MarketMarker>(db).findOne(
    { _id: keyOf(scope) },
    { projection: { worldEpoch: 1, turn: 1, status: 1, digest: 1 } }
  );
  if (
    market &&
    (market.worldEpoch !== scope.worldEpoch ||
      market.turn !== scope.turn ||
      !/^[a-f0-9]{64}$/.test(market.digest) ||
      (market.status !== "settled" && market.status !== "frozen"))
  )
    throw new FundedClosingPlanError("has an invalid market marker");
  return market;
}

export async function readFundedClosingState(db: Db, scope: Scope) {
  const id = manifestId(scope);
  const journal = corporationTurnJournalCollection<PlanManifest | PlanChunk>(db);
  const [market, manifest] = await Promise.all([
    readMarketMarker(db, scope),
    journal.findOne({ _id: id }),
  ]);
  if (market?.status !== "settled" && !manifest) return { market, continuation: null };
  if (
    market?.status !== "settled" ||
    manifest?.kind !== "fundedClosingManifest" ||
    manifest.version !== VERSION ||
    manifest.worldEpoch !== scope.worldEpoch ||
    manifest.turn !== scope.turn ||
    manifest.marketDigest !== market.digest ||
    !/^[a-f0-9]{64}$/.test(manifest.hash) ||
    !Number.isSafeInteger(manifest.chunkCount) ||
    manifest.chunkCount < 1 ||
    manifest.chunkCount > Math.ceil(MAX_BYTES / CHUNK_BYTES)
  )
    throw new FundedClosingPlanError("is missing or does not match the settled market");

  const ids = Array.from({ length: manifest.chunkCount }, (_, i) => chunkId(id, manifest.hash, i));
  const rows = await journal.find({ _id: { $in: ids } }).toArray();
  const chunks = new Map(rows.map((row) => [row._id, row]));
  const pieces = ids.map((id) => {
    const row = chunks.get(id);
    if (
      row?.kind !== "fundedClosingChunk" ||
      row.turn !== scope.turn ||
      typeof row.payload !== "string" ||
      row.payload.length > (CHUNK_BYTES * 4) / 3
    )
      throw new FundedClosingPlanError("has an invalid chunk");
    return Buffer.from(row.payload, "base64");
  });
  const compressed = Buffer.concat(pieces);
  if (hashOf(compressed) !== manifest.hash)
    throw new FundedClosingPlanError("failed its integrity check");

  try {
    const bytes = gunzipSync(compressed, { maxOutputLength: MAX_BYTES });
    const plan = decodeOutput(BSON.EJSON.parse(bytes.toString("utf8"))) as PlanEnvelope;
    if (
      plan.version !== VERSION ||
      plan.marketDigest !== market.digest ||
      plan.worldEpoch !== scope.worldEpoch ||
      plan.turn !== scope.turn ||
      plan.continuation.turn !== scope.turn
    )
      throw new Error("Closing continuation identity mismatch");
    return { market, continuation: plan.continuation };
  } catch (error) {
    throw new FundedClosingPlanError("could not be decoded", error);
  }
}

export async function saveFundedClosingPlan(
  db: Db,
  scope: Scope,
  continuation: FundedClosingContinuation
) {
  const market = await readMarketMarker(db, scope);
  if (market?.status !== "settled" || continuation.turn !== scope.turn)
    throw new FundedClosingPlanError("requires the matching settled market");

  const version = VERSION;
  const marketDigest = market.digest;
  const plan: PlanEnvelope = { ...scope, version, marketDigest, continuation };
  if (!isStorableOutput(plan)) throw new FundedClosingPlanError("contains unsupported data");
  const encoded = BSON.EJSON.stringify(encodeOutput(plan, true) as Document, { relaxed: false });
  if (Buffer.byteLength(encoded) > MAX_BYTES)
    throw new FundedClosingPlanError("exceeds the size limit");
  const compressed = gzipSync(encoded, { level: 3 });
  if (compressed.length > MAX_BYTES) throw new FundedClosingPlanError("exceeds the size limit");
  const hash = hashOf(compressed);
  const id = manifestId(scope);
  const chunkCount = Math.ceil(compressed.length / CHUNK_BYTES);
  const chunks: PlanChunk[] = Array.from({ length: chunkCount }, (_, index) => ({
    _id: chunkId(id, hash, index),
    kind: "fundedClosingChunk",
    turn: scope.turn,
    payload: compressed.subarray(index * CHUNK_BYTES, (index + 1) * CHUNK_BYTES).toString("base64"),
  }));
  const journal = corporationTurnJournalCollection<PlanManifest | PlanChunk>(db);
  // A manifest is the commit point. Its content-addressed chunks are immutable.
  await journal.bulkWrite(
    chunks.map((chunk) => ({
      updateOne: {
        filter: { _id: chunk._id, payload: chunk.payload },
        update: { $setOnInsert: chunk },
        upsert: true,
      },
    }))
  );
  await journal.insertOne({
    ...scope,
    _id: id,
    kind: "fundedClosingManifest",
    version,
    marketDigest,
    hash,
    chunkCount,
  });
}
