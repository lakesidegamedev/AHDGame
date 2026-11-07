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
