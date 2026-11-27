import { beforeEach, describe, expect, it, vi } from "vitest";
import { ObjectId } from "mongodb";
import { createTransactionalMemoryDb } from "@/lib/test-utils/transactionalMemoryDb";

vi.mock("@/lib/mongodb", () => ({ getDb: vi.fn() }));
vi.mock("@/lib/api/requireAdmin", () => ({
  requireAdmin: vi.fn().mockResolvedValue({ ok: true }),
}));

let db: ReturnType<typeof createTransactionalMemoryDb>["memory"];
beforeEach(async () => {
  const fixture = createTransactionalMemoryDb();
  db = fixture.memory;
  db.seed("gameState", [{ _id: "current", currentTurn: 7, worldEpochId: "test-world" }]);
  const { getDb } = await import("@/lib/mongodb");
  vi.mocked(getDb).mockResolvedValue(fixture.db);
});

describe("corporation share recalculation", () => {
  it("preserves modern and legacy reservations, listings and float without counting retained holdings twice", async () => {
    const corporationId = new ObjectId();
    db.seed("corporations", [
      {
        _id: corporationId,
        name: "Test",
        totalShares: 100,
        publicFloat: 10,
        shareholders: [{ characterId: new ObjectId(), shares: 50 }],
      },
    ]);
    db.seed("shareListings", [{ corporationId, status: "open", sharesRemaining: 5 }]);
    db.seed("shareOrders", [
      {
        corporationId,
        type: "sell",
        status: "open",
        shares: 40,
        sharesRemaining: 25,
        sharesDebitedAtCreation: true,
      },
      {
        corporationId,
        type: "sell",
        status: "open",
        sharesRemaining: 10,
        placerCorporationId: new ObjectId(),
      },
      { corporationId, type: "sell", status: "open", sharesRemaining: 10 },
      {
        corporationId,
        type: "sell",
        status: "open",
        sharesRemaining: 10,
        sharesDebitedAtCreation: false,
      },
      {
        corporationId,
        type: "sell",
        status: "cancelled",
        sharesRemaining: 500,
        sharesDebitedAtCreation: true,
      },
      {
        corporationId,
        type: "buy",
        status: "open",
        sharesRemaining: 500,
        sharesDebitedAtCreation: true,
      },
    ]);
    const { POST } = await import("./route");
    const response = await POST();
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ fixes: [], totalChecked: 1 });
    expect((await db.collection("corporations").findOne({ _id: corporationId }))?.totalShares).toBe(
      100
    );
  });
  it("rolls back a landed correction and retries without changing cash or holdings", async () => {
    const corporationId = new ObjectId();
    db.seed("corporations", [
      {
        _id: corporationId,
        name: "Repair",
        totalShares: 999,
        publicFloat: 10,
        liquidCapital: 1234,
        shareholders: [{ characterId: new ObjectId(), shares: 40 }],
      },
    ]);
    const collection = db.collection("corporations");
    const original = collection.bulkWrite.bind(collection);
    const fault = vi.spyOn(collection, "bulkWrite").mockImplementationOnce(async (...args) => {
      await original(...args);
      throw new Error("landed share repair failure");
    });
    const { POST } = await import("./route");
    expect((await POST()).ok).toBe(false);
    expect((await collection.findOne({ _id: corporationId }))?.totalShares).toBe(999);
    fault.mockRestore();
    const responses = await Promise.all([POST(), POST()]);
    expect(responses.every((response) => response.ok)).toBe(true);
    expect(await collection.findOne({ _id: corporationId })).toMatchObject({
      totalShares: 50,
      liquidCapital: 1234,
    });
    expect((await (await POST()).json()).fixes).toEqual([]);
  });

  it("refuses reconciliation while a turn is processing", async () => {
    await db
      .collection("gameState")
      .updateOne({ _id: "current" }, { $set: { isProcessing: true } });
    db.seed("corporations", [
      { _id: new ObjectId(), name: "Busy", totalShares: 999, publicFloat: 10 },
    ]);
    const { POST } = await import("./route");
    expect((await POST()).status).toBe(409);
    expect(db.collection("corporations").docs[0].totalShares).toBe(999);
  });
});
