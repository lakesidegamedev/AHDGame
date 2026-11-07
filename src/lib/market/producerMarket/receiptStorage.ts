/** Immutable content-addressed chunks keep full turn receipts below Mongo's document limit. */
import { createHash } from "node:crypto";
import { gzipSync, gunzipSync } from "node:zlib";
import type { Db } from "mongodb";

interface ReceiptChunk {
  _id: string;
  payload: string;
}
export interface EncodedReceipt {
  payload: string;
  digest: string;
  chunks: ReceiptChunk[];
}
const ARRAY_CHUNK_BYTES = 1024 * 1024;
const DOCUMENT_LIMIT = 12 * 1024 * 1024;
const ROOT_DECODE_LIMIT = 16 * 1024 * 1024;
const CHUNK_DECODE_LIMIT = 2 * ARRAY_CHUNK_BYTES;
const hash = (value: string | Uint8Array) => createHash("sha256").update(value).digest("hex");
const encode = (json: string) => gzipSync(json).toString("base64");
const decode = (payload: string, limit: number) =>
  gunzipSync(Buffer.from(payload, "base64"), { maxOutputLength: limit });

export function encodeReceipt(value: unknown, checkBudget?: () => void): EncodedReceipt {
  const chunks = new Map<string, ReceiptChunk>();
  const arrays = new WeakMap<unknown[], unknown>();
  const visit = (item: unknown): unknown => {
    checkBudget?.();
    if (Array.isArray(item) && arrays.has(item)) return arrays.get(item);
    if (Array.isArray(item) && item.length > 128) {
      const ids: string[] = [];
      let rows: string[] = [],
        bytes = 2;
      const flush = () => {
        if (!rows.length) return;
        const json = `[${rows.join(",")}]`;
        const id = hash(json);
        if (!chunks.has(id)) chunks.set(id, { _id: id, payload: encode(json) });
        ids.push(id);
        rows = [];
        bytes = 2;
      };
      for (const row of item) {
        // Compact nested supplier lists before serializing their containing row.
        // Otherwise every order/fill repeats the complete route graph.
        const json = JSON.stringify(visit(row));
        if (json === undefined) throw new Error("Unserializable producer receipt row");
        const size = Buffer.byteLength(json) + 1;
        if (size + 2 > ARRAY_CHUNK_BYTES)
          throw new Error("Producer receipt row exceeds chunk limit");
        if (bytes + size > ARRAY_CHUNK_BYTES) flush();
        rows.push(json);
        bytes += size;
      }
      flush();
      const marker = { $producerReceiptArray: ids, count: item.length };
      arrays.set(item, marker);
      return marker;
    }
    if (Array.isArray(item)) return item.map(visit);
    if (
      item &&
      typeof item === "object" &&
      ("$producerReceiptArray" in item || "$producerReceiptVersion" in item)
    )
      throw new Error("Reserved producer receipt field");
    if (item && typeof item === "object")
      return Object.fromEntries(Object.entries(item).map(([key, entry]) => [key, visit(entry)]));
    return item;
  };
  const root = visit(value);
  // One complete dependency manifest keeps decoding a single batched read,
  // even when a chunk contains references to another chunk.
  const json = JSON.stringify({
    $producerReceiptVersion: 2,
    chunks: [...chunks.keys()],
    value: root,
  });
  if (Buffer.byteLength(json) > ROOT_DECODE_LIMIT)
    throw new Error("Producer receipt manifest exceeds limit");
  const payload = encode(json);
  if (Buffer.byteLength(payload) > DOCUMENT_LIMIT)
    throw new Error("Producer receipt document exceeds limit");
  return { payload, digest: hash(json), chunks: [...chunks.values()] };
}

/** All chunks land before the caller atomically claims the complete manifest. */
export async function stageReceiptChunks(
  db: Db,
  chunks: readonly ReceiptChunk[],
  checkBudget?: () => void
): Promise<void> {
  if (!chunks.length) return;
  checkBudget?.();
  // Content hash is the primary key. Mongo's built-in unique _id index is sufficient.
  await db.collection<ReceiptChunk>("producerEconomyTurnChunks").bulkWrite(
    chunks.map((chunk) => ({
      updateOne: { filter: { _id: chunk._id }, update: { $setOnInsert: chunk }, upsert: true },
    }))
  );
  const stored = db
    .collection<ReceiptChunk>("producerEconomyTurnChunks")
    .find({ _id: { $in: chunks.map((chunk) => chunk._id) } })
    .batchSize(16);
  let count = 0;
  for await (const chunk of stored) {
    checkBudget?.();
    count++;
    if (hash(decode(chunk.payload, CHUNK_DECODE_LIMIT)) !== chunk._id)
      throw new Error("Staged producer receipt chunk checksum mismatch");
  }
  if (count !== chunks.length) throw new Error("Missing staged producer receipt chunk");
}

export async function decodeReceipt(
  db: Db,
  record: Pick<EncodedReceipt, "payload" | "digest">
): Promise<unknown> {
  const bytes = decode(record.payload, ROOT_DECODE_LIMIT);
  if (hash(bytes) !== record.digest) throw new Error("Producer receipt checksum mismatch");
  const envelope: unknown = JSON.parse(bytes.toString("utf8"));
  const versioned =
    envelope != null && typeof envelope === "object" && "$producerReceiptVersion" in envelope;
  if (versioned && envelope.$producerReceiptVersion !== 2)
    throw new Error("Unsupported producer receipt version");
  if (versioned && (!("value" in envelope) || !("chunks" in envelope)))
    throw new Error("Invalid producer receipt envelope");
  const root: unknown = versioned && "value" in envelope ? envelope.value : envelope;
  const required = new Set<string>();
  const collect = (value: unknown): void => {
    if (Array.isArray(value)) {
      value.forEach(collect);
      return;
    }
    if (!value || typeof value !== "object") return;
    if ("$producerReceiptArray" in value) {
      const ids = value.$producerReceiptArray;
      if (
        !Array.isArray(ids) ||
        ids.some((id) => typeof id !== "string" || !/^[a-f0-9]{64}$/.test(id))
      )
        throw new Error("Invalid producer receipt chunk reference");
      ids.forEach((id: string) => required.add(id));
    } else Object.values(value).forEach(collect);
  };
  if (versioned && "chunks" in envelope) {
    collect({ $producerReceiptArray: envelope.chunks });
  }
  collect(root);
  // New receipts can reference arrays inside chunk rows. Load each unique
  // content hash once, in bounded cursor batches, including nested references.
  const chunks = new Map<string, unknown[]>();
  if (required.size > 0) {
    const stored = db
      .collection<ReceiptChunk>("producerEconomyTurnChunks")
      .find({ _id: { $in: [...required] } })
      .batchSize(16);
    for await (const chunk of stored) {
      const decoded = decode(chunk.payload, CHUNK_DECODE_LIMIT);
      if (hash(decoded) !== chunk._id) throw new Error("Producer receipt chunk checksum mismatch");
      const rows: unknown = JSON.parse(decoded.toString("utf8"));
      if (!Array.isArray(rows)) throw new Error("Invalid producer receipt array chunk");
      chunks.set(chunk._id, rows);
      collect(rows);
    }
    if ([...required].some((id) => !chunks.has(id)))
      throw new Error("Missing producer receipt chunk");
  }
  const restored = new Map<string, unknown[]>();
  const arraysByMarker = new Map<string, unknown[]>();
  const restoring = new Set<string>();
  const restore = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(restore);
    if (!value || typeof value !== "object") return value;
    if ("$producerReceiptArray" in value) {
      const marker = value as { $producerReceiptArray: string[]; count: number };
      const key = JSON.stringify(marker.$producerReceiptArray);
      const cached = arraysByMarker.get(key);
      if (cached) {
        if (cached.length !== marker.count) throw new Error("Producer receipt row count mismatch");
        return cached;
      }
      const result: unknown[] = [];
      for (const id of marker.$producerReceiptArray) {
        const chunk = chunks.get(id);
        if (!chunk) throw new Error("Missing producer receipt chunk");
        let rows = restored.get(id);
        if (!rows) {
          if (restoring.has(id)) throw new Error("Cyclic producer receipt chunk");
          restoring.add(id);
          rows = chunk.map(restore);
          restoring.delete(id);
          restored.set(id, rows);
        }
        for (const row of rows) result.push(row);
      }
      if (result.length !== marker.count) throw new Error("Producer receipt row count mismatch");
      arraysByMarker.set(key, result);
      return result;
    }
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, restore(entry)]));
  };
  return restore(root);
}
