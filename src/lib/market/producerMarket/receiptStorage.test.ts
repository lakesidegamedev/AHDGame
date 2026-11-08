import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { gzipSync } from "node:zlib";
import type { Db } from "mongodb";
import { createInMemoryDb } from "@/lib/test-utils/inMemoryDb";
import { decodeReceipt, encodeReceipt, stageReceiptChunks } from "./receiptStorage";

describe("chunked producer receipts", () => {
  it("stores nested route and supplier lists once and restores shared arrays", async () => {
    const memory = createInMemoryDb();
    const ids = Array.from({ length: 500 }, (_, i) => `supplier:${i}`);
    const original = {
      eligibility: { a: ids, b: ids },
      orders: Array.from({ length: 1000 }, (_, i) => ({ id: i, eligibleOfferIds: ids })),
      fills: Array.from({ length: 1000 }, (_, i) => ({ id: i, supplierOfferIds: [...ids] })),
    };
    const encoded = encodeReceipt(original);
    expect(encoded.chunks.length).toBeLessThan(10);
    await stageReceiptChunks(memory as unknown as Db, encoded.chunks);
    const restored = (await decodeReceipt(memory as unknown as Db, encoded)) as typeof original;
    expect(restored).toEqual(original);
    expect(restored.orders[0].eligibleOfferIds).toBe(restored.eligibility.a);
    expect(restored.fills[999].supplierOfferIds).toBe(restored.eligibility.a);
  });

  it("accepts existing chunks encoded at another gzip level with the same content hash", async () => {
    const memory = createInMemoryDb();
    const original = { rows: Array.from({ length: 300 }, (_, id) => ({ id, value: id / 7 })) };
    const encoded = encodeReceipt(original);
    const { gunzipSync } = await import("node:zlib");
    for (const chunk of encoded.chunks) {
      const json = gunzipSync(Buffer.from(chunk.payload, "base64"));
      memory.collection("producerEconomyTurnChunks").docs.push({
        _id: chunk._id,
        payload: gzipSync(json, { level: 9 }).toString("base64"),
      });
    }
    await stageReceiptChunks(memory as unknown as Db, encoded.chunks);
    expect(await decodeReceipt(memory as unknown as Db, encoded)).toEqual(original);
    expect(memory.collection("producerEconomyTurnChunks").docs).toHaveLength(encoded.chunks.length);
  });

  it("keeps canonical string-list chunks, including escaping and UTF-8", async () => {
    const memory = createInMemoryDb();
    const ids = Array.from(
      { length: 1200 },
      (_, id) => `supplier:${id}:"\\\n${String.fromCodePoint(0x65e5, 0x672c)}`
    );
    const encoded = encodeReceipt({ ids });
    const digest = createHash("sha256").update(JSON.stringify(ids)).digest("hex");
    expect(encoded.chunks.map((chunk) => chunk._id)).toEqual([digest]);
    await stageReceiptChunks(memory as unknown as Db, encoded.chunks);
    expect(await decodeReceipt(memory as unknown as Db, encoded)).toEqual({ ids });
  });

  it("does not trust forged or mutated chunk identities during read-back", async () => {
    const memory = createInMemoryDb();
    const encoded = encodeReceipt({ rows: Array.from({ length: 200 }, (_, id) => String(id)) });
    const chunk = encoded.chunks[0];
    chunk._id = "0".repeat(64);
    await expect(stageReceiptChunks(memory as unknown as Db, [chunk])).rejects.toThrow("checksum");
    const forged = { ...chunk, _id: "1".repeat(64) };
    await expect(stageReceiptChunks(memory as unknown as Db, [forged])).rejects.toThrow("checksum");
  });

  it("keeps row boundaries when escaped string lists exceed a chunk", async () => {
    const ids = Array.from({ length: 130 }, () => "\n".repeat(5000));
    // Escaped rows occupy 10,003 bytes including the separator allowance:
    // the existing 1 MiB format fits 104 rows, followed by the remaining 26.
    const expected = [ids.slice(0, 104), ids.slice(104)].map((rows) =>
      createHash("sha256").update(JSON.stringify(rows)).digest("hex")
    );
    const encoded = encodeReceipt({ ids });
    expect(encoded.chunks.map((chunk) => chunk._id)).toEqual(expected);
    const memory = createInMemoryDb();
    await stageReceiptChunks(memory as unknown as Db, encoded.chunks);
    expect(await decodeReceipt(memory as unknown as Db, encoded)).toEqual({ ids });
  });

  it("retains rejection of sparse large arrays", () => {
    expect(() => encodeReceipt(new Array(129))).toThrow("Unserializable");
  });

  it("checks deadlines repeatedly within a large traversal", () => {
    let checks = 0;
    expect(() =>
      encodeReceipt({ rows: Array.from({ length: 9000 }, (_, id) => ({ id })) }, () => {
        if (++checks === 2) throw new Error("deadline during traversal");
      })
    ).toThrow("deadline during traversal");
    expect(checks).toBe(2);
  });

  it("reads the legacy flat chunk format without migration", async () => {
    const memory = createInMemoryDb();
    const rows = [{ supplierOfferIds: ["a", "b"] }];
    const json = JSON.stringify(rows);
    const id = createHash("sha256").update(json).digest("hex");
    memory.collection("producerEconomyTurnChunks").docs.push({
      _id: id,
      payload: gzipSync(json).toString("base64"),
    });
    const root = JSON.stringify({ fills: { $producerReceiptArray: [id], count: 1 } });
    expect(
      await decodeReceipt(memory as unknown as Db, {
        payload: gzipSync(root).toString("base64"),
        digest: createHash("sha256").update(root).digest("hex"),
      })
    ).toEqual({ fills: rows });
  });

  it("rejects a missing nested supplier chunk before returning a receipt", async () => {
    const memory = createInMemoryDb();
    const encoded = encodeReceipt({
      orders: Array.from({ length: 129 }, (_, id) => ({
        id,
        suppliers: Array.from({ length: 129 }, (_, i) => `supplier:${i}`),
      })),
    });
    await stageReceiptChunks(memory as unknown as Db, encoded.chunks);
    memory.collection("producerEconomyTurnChunks").docs.splice(0, 1);
    await expect(decodeReceipt(memory as unknown as Db, encoded)).rejects.toThrow("Missing");
  });

  it("checks the host deadline during encoding", () => {
    expect(() =>
      encodeReceipt({ orders: [1] }, () => {
        throw new Error("deadline");
      })
    ).toThrow("deadline");
  });

  it("round-trips a complete receipt beyond a Mongo document without changing any rows", async () => {
    const memory = createInMemoryDb();
    const db = memory as unknown as Db;
    const original = {
      version: 1,
      trades: Array.from({ length: 20000 }, (_, i) => ({
        id: `trade:${i}`,
        units: i,
        note: "x".repeat(1024),
      })),
      accounts: [{ id: "a", cash: 1 }],
    };
    const encoded = encodeReceipt(original);
    expect(encoded.chunks.length).toBeGreaterThan(20);
    expect(Buffer.byteLength(encoded.payload)).toBeLessThan(1024 * 1024);
    for (const chunk of encoded.chunks)
      expect(Buffer.byteLength(chunk.payload)).toBeLessThan(12 * 1024 * 1024);
    await stageReceiptChunks(db, encoded.chunks);
    await stageReceiptChunks(db, encoded.chunks);
    expect(memory.collection("producerEconomyTurnChunks").docs).toHaveLength(encoded.chunks.length);
    expect(await decodeReceipt(db, encoded)).toEqual(original);
  });

  it("fails closed for missing or corrupted chunks", async () => {
    const memory = createInMemoryDb();
    const db = memory as unknown as Db;
    const encoded = encodeReceipt({
      trades: Array.from({ length: 129 }, (_, i) => ({ units: i })),
    });
    await expect(decodeReceipt(db, encoded)).rejects.toThrow("Missing");
    await stageReceiptChunks(db, encoded.chunks);
    memory.collection("producerEconomyTurnChunks").docs[0].payload = encodeReceipt([1]).payload;
    await expect(decodeReceipt(db, encoded)).rejects.toThrow("checksum");
    await expect(stageReceiptChunks(db, encoded.chunks)).rejects.toThrow("checksum");
  });

  it("rejects a single oversized row before staging any receipt", () => {
    expect(() => encodeReceipt(Array.from({ length: 129 }, () => "x".repeat(1024 * 1024)))).toThrow(
      "row exceeds"
    );
  });
});
