/** Immutable content-addressed chunks keep full turn receipts below Mongo's document limit. */
import { createHash } from "node:crypto";
import { gzipSync, gunzipSync } from "node:zlib";
import type { Db } from "mongodb";
import { producerEconomyTurnChunksCollection } from "@/lib/db/repositories/producerEconomyTurnChunks";

interface ReceiptChunk {
  _id: string;
  payload: string;
}
export interface EncodedReceipt {
  payload: string;
  digest: string;
  chunks: ReceiptChunk[];
}
// Only chunks hashed and encoded by this call path can use byte-for-byte
// read-back verification. Reconstructed or mutated chunks still need decoding.
const encodedChunks = new WeakMap<ReceiptChunk, { id: string; payload: string }>();
const newChunk = (id: string, json: string): ReceiptChunk => {
  const chunk = { _id: id, payload: encode(json) };
  encodedChunks.set(chunk, { id, payload: chunk.payload });
  return chunk;
};
const ARRAY_CHUNK_BYTES = 1024 * 1024;
const DOCUMENT_LIMIT = 12 * 1024 * 1024;
const ROOT_DECODE_LIMIT = 16 * 1024 * 1024;
const CHUNK_DECODE_LIMIT = 2 * ARRAY_CHUNK_BYTES;
const hash = (value: string | Uint8Array) => createHash("sha256").update(value).digest("hex");
const encode = (json: string) => gzipSync(json, { level: 3 }).toString("base64");
const decode = (payload: string, limit: number) =>
  gunzipSync(Buffer.from(payload, "base64"), { maxOutputLength: limit });

export function encodeReceipt(value: unknown, checkBudget?: () => void): EncodedReceipt {
  const chunks = new Map<string, ReceiptChunk>();
  const arrays = new WeakMap<unknown[], unknown>();
  let visited = 0;
  const visit = (item: unknown): unknown => {
    // Route graphs contain millions of scalar ids. Check in bounded traversal
    // batches rather than reading the host clock for every scalar.
    if ((visited++ & 1023) === 0) checkBudget?.();
    if (Array.isArray(item) && arrays.has(item)) return arrays.get(item);
    if (Array.isArray(item) && item.length > 128) {
      // Supplier/route lists are plain ids and normally fit one chunk. Native
      // array serialization avoids stringify + allocation for every individual id.
      // Keep the original row accounting (including its trailing comma allowance)
      // so existing content hashes and chunk boundaries remain unchanged.
      let stringCharacters = 2;
      let stringRows = 0;
      if (
        item.every((row, index) => {
          if ((index & 1023) === 0) checkBudget?.();
          if (typeof row !== "string") return false;
          stringRows++;
          stringCharacters += row.length + 3;
          return stringCharacters <= ARRAY_CHUNK_BYTES;
        }) &&
        stringRows === item.length
      ) {
        checkBudget?.();
        const json = JSON.stringify(item);
        if (Buffer.byteLength(json) + 1 <= ARRAY_CHUNK_BYTES) {
          const id = hash(json);
          if (!chunks.has(id)) chunks.set(id, newChunk(id, json));
          checkBudget?.();
          const marker = { $producerReceiptArray: [id], count: item.length };
          arrays.set(item, marker);
          return marker;
        }
      }
      const ids: string[] = [];
      let rows: string[] = [],
        bytes = 2;
      const flush = () => {
        if (!rows.length) return;
        checkBudget?.();
        const json = `[${rows.join(",")}]`;
        const id = hash(json);
        if (!chunks.has(id)) chunks.set(id, newChunk(id, json));
        checkBudget?.();
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
    // Rows that hold no large array come back as the same reference, so the
    // common case allocates nothing and stringifies the original.
    if (Array.isArray(item)) {
      let copy: unknown[] | undefined;
      for (let i = 0; i < item.length; i++) {
        const visited = visit(item[i]);
        if (copy) copy[i] = visited;
        else if (visited !== item[i]) {
          copy = item.slice(0, i);
          copy[i] = visited;
        }
      }
      return copy ?? item;
    }
    if (
      item &&
      typeof item === "object" &&
      ("$producerReceiptArray" in item || "$producerReceiptVersion" in item)
    )
      throw new Error("Reserved producer receipt field");
    if (item && typeof item === "object") {
      const proto = Object.getPrototypeOf(item);
      if (proto !== Object.prototype && proto !== null)
        return Object.fromEntries(Object.entries(item).map(([key, entry]) => [key, visit(entry)]));
      const keys = Object.keys(item);
      let values: unknown[] | undefined;
      for (let i = 0; i < keys.length; i++) {
        const original = (item as Record<string, unknown>)[keys[i]];
        const visited = visit(original);
        if (values) values[i] = visited;
        else if (visited !== original || keys[i] === "__proto__") {
          values = keys.slice(0, i).map((key) => (item as Record<string, unknown>)[key]);
          values[i] = visited;
        }
      }
      if (!values) return item;
      return Object.fromEntries(keys.map((key, i) => [key, values[i]]));
    }
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
  checkBudget?.();
  const payload = encode(json);
  checkBudget?.();
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
  await producerEconomyTurnChunksCollection<ReceiptChunk>(db).bulkWrite(
    chunks.map((chunk) => ({
      updateOne: { filter: { _id: chunk._id }, update: { $setOnInsert: chunk }, upsert: true },
    }))
  );
  const expected = new Map(chunks.map((chunk) => [chunk._id, encodedChunks.get(chunk)]));
  const stored = producerEconomyTurnChunksCollection<ReceiptChunk>(db)
    .find({ _id: { $in: chunks.map((chunk) => chunk._id) } })
    .batchSize(64);
  let count = 0;
  for await (const chunk of stored) {
    checkBudget?.();
    count++;
    const encoded = expected.get(chunk._id);
    // Matching the exact bytes we just encoded proves the persisted payload is
    // intact without inflating and hashing the entire receipt a second time.
    if (encoded?.id === chunk._id && encoded.payload === chunk.payload) continue;
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
    const stored = producerEconomyTurnChunksCollection<ReceiptChunk>(db)
      .find({ _id: { $in: [...required] } })
      .batchSize(64);
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
