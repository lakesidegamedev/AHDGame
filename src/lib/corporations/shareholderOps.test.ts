import { createInMemoryDb } from "@/lib/test-utils/inMemoryDb";
import type { Db } from "mongodb";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { ObjectId } from "mongodb";
import { createMockDb, type MockDb } from "@/lib/test-utils/mockDb";

vi.mock("@/lib/mongodb", () => ({ getDb: vi.fn() }));

let db: MockDb;

beforeEach(() => {
  db = createMockDb();
  // Pre-initialize the corporations collection so collectionMocks["corporations"] exists
  // before tests reference it directly to set up mock return values.
  db.collection("corporations");
  vi.clearAllMocks();
});

describe("creditShares (character, cost basis)", () => {
  it("sets avgCostPerShare on first push when pricePerShare is given", async () => {
    const corpId = new ObjectId();
    const charId = new ObjectId();

    db.collectionMocks["corporations"].updateOne
      .mockResolvedValueOnce({ matchedCount: 0 }) // inc misses
      .mockResolvedValueOnce({ matchedCount: 1 }); // push

    const { creditShares } = await import("./shareholderOps");
    await creditShares(db as any, corpId, charId, 100, undefined, { pricePerShare: 22.5 });

    const pushCall = db.collectionMocks["corporations"].updateOne.mock.calls.find(
      (c: any[]) => c[1].$push?.shareholders
    );
    expect(pushCall).toBeDefined();
    expect(pushCall![1].$push.shareholders.avgCostPerShare).toBe(22.5);
  });

  it("blends weighted average when adding to an existing character position", async () => {
    const corpId = new ObjectId();
    const charId = new ObjectId();

    db.collectionMocks["corporations"].findOne.mockResolvedValue({
      _id: corpId,
      shareholders: [{ characterId: charId, shares: 100, avgCostPerShare: 10 }],
    });
    db.collectionMocks["corporations"].updateOne.mockResolvedValue({ matchedCount: 1 });

    const { creditShares } = await import("./shareholderOps");
    await creditShares(db as any, corpId, charId, 50, undefined, { pricePerShare: 16 });

    const setCall = db.collectionMocks["corporations"].updateOne.mock.calls.find(
      (c: any[]) => c[1].$set?.["shareholders.$.avgCostPerShare"] !== undefined
    );
    expect(setCall).toBeDefined();
    const avgSet = setCall![1].$set["shareholders.$.avgCostPerShare"] as number;
    expect(Math.round(avgSet * 1000) / 1000).toBeCloseTo(12, 2);
  });
});

describe("creditSharesToCorp", () => {
  it.each([false, true])(
    "credits quantity and weighted cost in the same write, existing=%s",
    async (existing) => {
      const memory = createInMemoryDb(),
        target = new ObjectId(),
        owner = new ObjectId();
      memory.seed("corporations", [
        {
          _id: target,
          shareholders: existing
            ? [{ corporationId: owner, shares: 1000, avgCostPerShare: 10 }]
            : [],
        },
      ]);
      const { creditSharesToCorp } = await import("./shareholderOps");
      expect(await creditSharesToCorp(memory as unknown as Db, target, owner, 500, 12)).toBe(true);
      const row = memory.collection("corporations").docs[0];
      const entries = row.shareholders as { shares: number; avgCostPerShare: number }[];
      expect(entries).toHaveLength(1);
      expect(entries[0].shares).toBe(existing ? 1500 : 500);
      expect(entries[0].avgCostPerShare).toBeCloseTo(existing ? 16000 / 1500 : 12, 8);
    }
  );
  it("preserves guarded cash/public-float changes in the same atomic credit", async () => {
    const memory = createInMemoryDb(),
      target = new ObjectId(),
      owner = new ObjectId();
    memory.seed("corporations", [
      { _id: target, shareholders: [], publicFloat: 500, liquidCapital: 0 },
    ]);
    const { creditSharesToCorp } = await import("./shareholderOps");
    const credit = () =>
      creditSharesToCorp(
        memory as unknown as Db,
        target,
        owner,
        500,
        12,
        { $inc: { publicFloat: -500, liquidCapital: 6000 } },
        { guardFilter: { publicFloat: { $gte: 500 } } }
      );
    expect(await credit()).toBe(true);
    expect(await credit()).toBe(false);
    expect(memory.collection("corporations").docs[0]).toMatchObject({
      publicFloat: 0,
      liquidCapital: 6000,
    });
    expect(memory.collection("corporations").docs[0].shareholders).toHaveLength(1);
  });
  it("fails closed for a missing recipient", async () => {
    const memory = createInMemoryDb();
    const { creditSharesToCorp } = await import("./shareholderOps");
    await expect(
      creditSharesToCorp(memory as unknown as Db, new ObjectId(), new ObjectId(), 1, 12)
    ).rejects.toThrow("unavailable");
  });
});

describe("debitSharesFromCorp", () => {
  it("decrements shares from a corp shareholder entry", async () => {
    const targetCorpId = new ObjectId();
    const holderCorpId = new ObjectId();

    db.collectionMocks["corporations"].findOneAndUpdate.mockResolvedValue({
      _id: targetCorpId,
      shareholders: [{ corporationId: holderCorpId, shares: 500 }],
    });

    const { debitSharesFromCorp } = await import("./shareholderOps");
    const remaining = await debitSharesFromCorp(db as any, targetCorpId, holderCorpId, 200);

    expect(remaining).toBe(500);
  });

  it("removes entry when shares reach zero", async () => {
    const targetCorpId = new ObjectId();
    const holderCorpId = new ObjectId();

    db.collectionMocks["corporations"].findOneAndUpdate.mockResolvedValue({
      _id: targetCorpId,
      shareholders: [{ corporationId: holderCorpId, shares: 0 }],
    });
    db.collectionMocks["corporations"].updateOne.mockResolvedValue({ modifiedCount: 1 });

    const { debitSharesFromCorp } = await import("./shareholderOps");
    const remaining = await debitSharesFromCorp(db as any, targetCorpId, holderCorpId, 200);

    expect(remaining).toBe(0);
    expect(db.collectionMocks["corporations"].updateOne).toHaveBeenCalledWith(
      { _id: targetCorpId },
      expect.any(Array)
    );
  });

  it("propagates the Mongo session to the primary findOneAndUpdate", async () => {
    const targetCorpId = new ObjectId();
    const holderCorpId = new ObjectId();
    const session = { sentinel: "sess" } as any;

    db.collectionMocks["corporations"].findOneAndUpdate.mockResolvedValue({
      _id: targetCorpId,
      shareholders: [{ corporationId: holderCorpId, shares: 500 }],
    });

    const { debitSharesFromCorp } = await import("./shareholderOps");
    await debitSharesFromCorp(db as any, targetCorpId, holderCorpId, 200, undefined, {
      requireSufficient: true,
      session,
    });

    const call = db.collectionMocks["corporations"].findOneAndUpdate.mock.calls[0];
    expect(call[2]).toMatchObject({ returnDocument: "after", session });
  });

  it("passes the session to the empty-position cleanup when the entry is removed", async () => {
    const targetCorpId = new ObjectId();
    const holderCorpId = new ObjectId();
    const session = { sentinel: "sess" } as any;

    db.collectionMocks["corporations"].findOneAndUpdate.mockResolvedValue({
      _id: targetCorpId,
      shareholders: [{ corporationId: holderCorpId, shares: 0 }],
    });
    db.collectionMocks["corporations"].updateOne.mockResolvedValue({ modifiedCount: 1 });

    const { debitSharesFromCorp } = await import("./shareholderOps");
    await debitSharesFromCorp(db as any, targetCorpId, holderCorpId, 200, undefined, { session });

    const pullCall = db.collectionMocks["corporations"].updateOne.mock.calls.find((c: unknown[]) =>
      Array.isArray(c[1])
    );
    expect(pullCall).toBeDefined();
    expect(pullCall![2]).toMatchObject({ session });
  });
});

describe("debitSharesFromImperial", () => {
  it("propagates the Mongo session to the primary findOneAndUpdate", async () => {
    const targetCorpId = new ObjectId();
    const imperialCharacterId = new ObjectId();
    const session = { sentinel: "sess" } as any;

    db.collectionMocks["corporations"].findOneAndUpdate.mockResolvedValue({
      _id: targetCorpId,
      shareholders: [{ imperialCharacterId, shares: 800 }],
    });

    const { debitSharesFromImperial } = await import("./shareholderOps");
    await debitSharesFromImperial(db as any, targetCorpId, imperialCharacterId, 200, undefined, {
      requireSufficient: true,
      session,
    });

    const call = db.collectionMocks["corporations"].findOneAndUpdate.mock.calls[0];
    expect(call[2]).toMatchObject({ returnDocument: "after", session });
  });

  it("passes the session to the empty-position cleanup when the entry is removed", async () => {
    const targetCorpId = new ObjectId();
    const imperialCharacterId = new ObjectId();
    const session = { sentinel: "sess" } as any;

    db.collectionMocks["corporations"].findOneAndUpdate.mockResolvedValue({
      _id: targetCorpId,
      shareholders: [{ imperialCharacterId, shares: 0 }],
    });
    db.collectionMocks["corporations"].updateOne.mockResolvedValue({ modifiedCount: 1 });

    const { debitSharesFromImperial } = await import("./shareholderOps");
    await debitSharesFromImperial(db as any, targetCorpId, imperialCharacterId, 200, undefined, {
      session,
    });

    const pullCall = db.collectionMocks["corporations"].updateOne.mock.calls.find((c: unknown[]) =>
      Array.isArray(c[1])
    );
    expect(pullCall).toBeDefined();
    expect(pullCall![2]).toMatchObject({ session });
  });
});

describe("debitShares", () => {
  it("forwards $unset fields to the corporation write", async () => {
    const corpId = new ObjectId();
    const charId = new ObjectId();

    db.collectionMocks["corporations"].findOneAndUpdate.mockResolvedValue({
      _id: corpId,
      shareholders: [{ characterId: charId, shares: 0 }],
    });
    db.collectionMocks["corporations"].updateOne.mockResolvedValue({ modifiedCount: 1 });

    const { debitShares } = await import("./shareholderOps");
    const remaining = await debitShares(
      db as any,
      corpId,
      charId,
      100,
      {
        $set: { ceoVacant: true },
        $unset: { ceoId: "", userId: "", pendingCeoCharacterId: "" },
      },
      { requireSufficient: true }
    );

    expect(remaining).toBe(0);
    expect(db.collectionMocks["corporations"].findOneAndUpdate).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        $set: { ceoVacant: true },
        $unset: { ceoId: "", userId: "", pendingCeoCharacterId: "" },
      }),
      { returnDocument: "after", projection: { shareholders: 1 } }
    );
  });

  it("passes the session to the empty-position cleanup when the entry is removed", async () => {
    const corpId = new ObjectId();
    const charId = new ObjectId();
    const session = { sentinel: "sess" } as any;

    db.collectionMocks["corporations"].findOneAndUpdate.mockResolvedValue({
      _id: corpId,
      shareholders: [{ characterId: charId, shares: 0 }],
    });
    db.collectionMocks["corporations"].updateOne.mockResolvedValue({ modifiedCount: 1 });

    const { debitShares } = await import("./shareholderOps");
    await debitShares(db as any, corpId, charId, 100, undefined, { session });

    const pullCall = db.collectionMocks["corporations"].updateOne.mock.calls.find((c: unknown[]) =>
      Array.isArray(c[1])
    );
    expect(pullCall).toBeDefined();
    expect(pullCall![2]).toMatchObject({ session });
  });
});

describe("creditSharesToFund", () => {
  it.each([false, true])(
    "credits quantity and weighted cost in the same write, existing=%s",
    async (existing) => {
      const memory = createInMemoryDb(),
        target = new ObjectId(),
        owner = new ObjectId();
      memory.seed("corporations", [
        {
          _id: target,
          shareholders: existing ? [{ fundId: owner, shares: 1000, avgCostPerShare: 10 }] : [],
        },
      ]);
      const { creditSharesToFund } = await import("./shareholderOps");
      expect(await creditSharesToFund(memory as unknown as Db, target, owner, 500, 12)).toBe(true);
      const row = memory.collection("corporations").docs[0];
      const entries = row.shareholders as { shares: number; avgCostPerShare: number }[];
      expect(entries).toHaveLength(1);
      expect(entries[0].shares).toBe(existing ? 1500 : 500);
      expect(entries[0].avgCostPerShare).toBeCloseTo(existing ? 16000 / 1500 : 12, 8);
    }
  );
  it("preserves guarded cash/public-float changes in the same atomic credit", async () => {
    const memory = createInMemoryDb(),
      target = new ObjectId(),
      owner = new ObjectId();
    memory.seed("corporations", [
      { _id: target, shareholders: [], publicFloat: 500, liquidCapital: 0 },
    ]);
    const { creditSharesToFund } = await import("./shareholderOps");
    const credit = () =>
      creditSharesToFund(
        memory as unknown as Db,
        target,
        owner,
        500,
        12,
        { $inc: { publicFloat: -500, liquidCapital: 6000 } },
        { guardFilter: { publicFloat: { $gte: 500 } } }
      );
    expect(await credit()).toBe(true);
    expect(await credit()).toBe(false);
    expect(memory.collection("corporations").docs[0]).toMatchObject({
      publicFloat: 0,
      liquidCapital: 6000,
    });
    expect(memory.collection("corporations").docs[0].shareholders).toHaveLength(1);
  });
  it("fails closed for a missing recipient", async () => {
    const memory = createInMemoryDb();
    const { creditSharesToFund } = await import("./shareholderOps");
    await expect(
      creditSharesToFund(memory as unknown as Db, new ObjectId(), new ObjectId(), 1, 12)
    ).rejects.toThrow("unavailable");
  });
});

describe("debitSharesFromFund", () => {
  it("decrements a fund shareholder entry", async () => {
    const targetCorpId = new ObjectId();
    const fundId = new ObjectId();

    db.collectionMocks["corporations"].findOneAndUpdate.mockResolvedValue({
      _id: targetCorpId,
      shareholders: [{ fundId, shares: 700 }],
    });

    const { debitSharesFromFund } = await import("./shareholderOps");
    const remaining = await debitSharesFromFund(db as any, targetCorpId, fundId, 300);

    expect(remaining).toBe(700);
    const call = db.collectionMocks["corporations"].findOneAndUpdate.mock.calls[0];
    expect(call[0]).toMatchObject({ _id: targetCorpId, "shareholders.fundId": fundId });
    expect(call[1].$inc["shareholders.$.shares"]).toBe(-300);
  });

  it("removes a fund entry when shares reach zero", async () => {
    const targetCorpId = new ObjectId();
    const fundId = new ObjectId();

    db.collectionMocks["corporations"].findOneAndUpdate.mockResolvedValue({
      _id: targetCorpId,
      shareholders: [{ fundId, shares: 0 }],
    });
    db.collectionMocks["corporations"].updateOne.mockResolvedValue({ modifiedCount: 1 });

    const { debitSharesFromFund } = await import("./shareholderOps");
    const remaining = await debitSharesFromFund(db as any, targetCorpId, fundId, 300);

    expect(remaining).toBe(0);
    expect(db.collectionMocks["corporations"].updateOne).toHaveBeenCalledWith(
      { _id: targetCorpId },
      expect.any(Array)
    );
  });

  // Regression: the primary debit must run inside the caller's transaction.
  // When it ran outside the session, a `withTransaction` retry re-applied the
  // already-committed debit, double-debiting the seller fund in cross-fund
  // rebalancing and destroying shares from the cap table (Corp 117, -3,351).
  it("propagates the Mongo session to the primary findOneAndUpdate", async () => {
    const targetCorpId = new ObjectId();
    const fundId = new ObjectId();
    const session = { sentinel: "sess" } as any;

    db.collectionMocks["corporations"].findOneAndUpdate.mockResolvedValue({
      _id: targetCorpId,
      shareholders: [{ fundId, shares: 700 }],
    });

    const { debitSharesFromFund } = await import("./shareholderOps");
    await debitSharesFromFund(db as any, targetCorpId, fundId, 300, undefined, {
      requireSufficient: true,
      session,
    });

    const call = db.collectionMocks["corporations"].findOneAndUpdate.mock.calls[0];
    expect(call[2]).toMatchObject({ returnDocument: "after", session });
  });
});

describe("creditSharesToNpp", () => {
  it.each([false, true])(
    "credits quantity and weighted cost in the same write, existing=%s",
    async (existing) => {
      const memory = createInMemoryDb(),
        target = new ObjectId(),
        owner = new ObjectId();
      memory.seed("corporations", [
        {
          _id: target,
          shareholders: existing ? [{ nppId: owner, shares: 1000, avgCostPerShare: 10 }] : [],
        },
      ]);
      const { creditSharesToNpp } = await import("./shareholderOps");
      expect(await creditSharesToNpp(memory as unknown as Db, target, owner, 500, 12)).toBe(true);
      const row = memory.collection("corporations").docs[0];
      const entries = row.shareholders as { shares: number; avgCostPerShare: number }[];
      expect(entries).toHaveLength(1);
      expect(entries[0].shares).toBe(existing ? 1500 : 500);
      expect(entries[0].avgCostPerShare).toBeCloseTo(existing ? 16000 / 1500 : 12, 8);
    }
  );
  it("preserves guarded cash/public-float changes in the same atomic credit", async () => {
    const memory = createInMemoryDb(),
      target = new ObjectId(),
      owner = new ObjectId();
    memory.seed("corporations", [
      { _id: target, shareholders: [], publicFloat: 500, liquidCapital: 0 },
    ]);
    const { creditSharesToNpp } = await import("./shareholderOps");
    const credit = () =>
      creditSharesToNpp(
        memory as unknown as Db,
        target,
        owner,
        500,
        12,
        { $inc: { publicFloat: -500, liquidCapital: 6000 } },
        { guardFilter: { publicFloat: { $gte: 500 } } }
      );
    expect(await credit()).toBe(true);
    expect(await credit()).toBe(false);
    expect(memory.collection("corporations").docs[0]).toMatchObject({
      publicFloat: 0,
      liquidCapital: 6000,
    });
    expect(memory.collection("corporations").docs[0].shareholders).toHaveLength(1);
  });
  it("fails closed for a missing recipient", async () => {
    const memory = createInMemoryDb();
    const { creditSharesToNpp } = await import("./shareholderOps");
    await expect(
      creditSharesToNpp(memory as unknown as Db, new ObjectId(), new ObjectId(), 1, 12)
    ).rejects.toThrow("unavailable");
  });
});

describe("debitSharesFromNpp", () => {
  it("decrements an NPP shareholder entry", async () => {
    const targetCorpId = new ObjectId();
    const nppId = new ObjectId();

    db.collectionMocks["corporations"].findOneAndUpdate.mockResolvedValue({
      _id: targetCorpId,
      shareholders: [{ nppId, shares: 700 }],
    });

    const { debitSharesFromNpp } = await import("./shareholderOps");
    const remaining = await debitSharesFromNpp(db as any, targetCorpId, nppId, 300);

    expect(remaining).toBe(700);
    const call = db.collectionMocks["corporations"].findOneAndUpdate.mock.calls[0];
    expect(call[0]).toMatchObject({ _id: targetCorpId, "shareholders.nppId": nppId });
    expect(call[1].$inc["shareholders.$.shares"]).toBe(-300);
  });

  it("removes an NPP entry when shares reach zero", async () => {
    const targetCorpId = new ObjectId();
    const nppId = new ObjectId();

    db.collectionMocks["corporations"].findOneAndUpdate.mockResolvedValue({
      _id: targetCorpId,
      shareholders: [{ nppId, shares: 0 }],
    });
    db.collectionMocks["corporations"].updateOne.mockResolvedValue({ modifiedCount: 1 });

    const { debitSharesFromNpp } = await import("./shareholderOps");
    const remaining = await debitSharesFromNpp(db as any, targetCorpId, nppId, 300);

    expect(remaining).toBe(0);
    expect(db.collectionMocks["corporations"].updateOne).toHaveBeenCalledWith(
      { _id: targetCorpId },
      expect.any(Array)
    );
  });
});

it.each([
  ["characterId", "debitShares"],
  ["imperialCharacterId", "debitSharesFromImperial"],
  ["corporationId", "debitSharesFromCorp"],
  ["fundId", "debitSharesFromFund"],
  ["nppId", "debitSharesFromNpp"],
] as const)(
  "keeps a renewed %s position when its credit races empty-position cleanup",
  async (field, name) => {
    const memory = createInMemoryDb(),
      target = new ObjectId(),
      owner = new ObjectId();
    memory.seed("corporations", [{ _id: target, shareholders: [{ [field]: owner, shares: 1 }] }]);
    const col = memory.collection("corporations"),
      write = col.updateOne.bind(col);
    vi.spyOn(col, "updateOne").mockImplementationOnce(async (...args) => {
      await write(
        { _id: target, [`shareholders.${field}`]: owner },
        { $inc: { "shareholders.$.shares": 3 } }
      );
      return write(...args);
    });
    const ops = await import("./shareholderOps");
    await ops[name](memory as unknown as Db, target, owner, 1);
    expect(col.docs[0].shareholders).toEqual([{ [field]: owner, shares: 3 }]);
  }
);
