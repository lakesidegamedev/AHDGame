import { describe, expect, it } from "vitest";
import { ObjectId, type Db } from "mongodb";
import { createInMemoryDb } from "@/lib/test-utils/inMemoryDb";
import { notifyBankFailure } from "../failureNotice";

describe("notifyBankFailure", () => {
  const corporationId = new ObjectId();
  const userId = new ObjectId();

  it("writes one notice per failure and skips a replay", async () => {
    const mem = createInMemoryDb();
    const db = mem as unknown as Db;
    const input = { corporationId, bankName: "Test Bank", userId, turn: 42, depositTaking: true };
    expect(await notifyBankFailure(db, input)).toBe(true);
    expect(await notifyBankFailure(db, input)).toBe(false);
    const docs = mem.collection("notifications").docs;
    expect(docs).toHaveLength(1);
    expect(docs[0]).toMatchObject({ title: "Bank closed", read: false });
    expect(docs[0].message).toContain("Test Bank");
    expect(docs[0].message).not.toMatch(/[–—]/);
  });

  it("sends nothing for system-owned or ownerless banks", async () => {
    const mem = createInMemoryDb();
    const db = mem as unknown as Db;
    const base = { corporationId, bankName: "B", turn: 1, depositTaking: false };
    expect(await notifyBankFailure(db, { ...base, userId: null })).toBe(false);
    expect(
      await notifyBankFailure(db, { ...base, userId: new ObjectId("000000000000000000000000") })
    ).toBe(false);
    expect(mem.collection("notifications").docs).toHaveLength(0);
  });
});
