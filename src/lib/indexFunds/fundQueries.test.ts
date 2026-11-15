import { describe, it, expect, vi } from "vitest";
import { ObjectId } from "mongodb";
import {
  FUND_COLLECTION,
  FUND_POSITION_COLLECTION,
  FUND_TRANSACTION_COLLECTION,
  FUND_REDEMPTION_QUEUE_COLLECTION,
  FUND_SNAPSHOT_COLLECTION,
  creditFundPosition,
  debitFundHoldingShares,
  listServiceableFunds,
} from "./fundQueries";

describe("fundQueries constants", () => {
  it("collection names match the migration index plan", () => {
    expect(FUND_COLLECTION).toBe("indexFunds");
    expect(FUND_POSITION_COLLECTION).toBe("indexFundPositions");
    expect(FUND_TRANSACTION_COLLECTION).toBe("indexFundTransactions");
    expect(FUND_REDEMPTION_QUEUE_COLLECTION).toBe("indexFundRedemptionQueue");
    expect(FUND_SNAPSHOT_COLLECTION).toBe("indexFundSnapshots");
  });
});

describe("listServiceableFunds", () => {
  it("includes active and backing-paused funds but not manual pauses", async () => {
    const toArray = vi.fn().mockResolvedValue([]);
    const sort = vi.fn().mockReturnValue({ toArray });
    const find = vi.fn().mockReturnValue({ sort });
    const db = { collection: vi.fn().mockReturnValue({ find }) } as never;

    await listServiceableFunds(db);

    expect(find).toHaveBeenCalledWith(
      { $or: [{ status: "active" }, { status: "paused", pauseReason: "backing_ratio" }] },
      { projection: { floatSettlementPlan: 0 } }
    );
    expect(toArray).toHaveBeenCalledOnce();
  });
});

describe("debitFundHoldingShares", () => {
  it("guards on sufficient inventory and removes an exhausted holding", async () => {
    const fundId = new ObjectId();
    const corporationId = new ObjectId();
    const updateOne = vi
      .fn()
      .mockResolvedValueOnce({ matchedCount: 1 })
      .mockResolvedValueOnce({ matchedCount: 1 });
    const findOne = vi.fn().mockResolvedValue({
      holdings: [{ corporationId, shares: 0 }],
    });
    const db = { collection: vi.fn(() => ({ updateOne, findOne })) } as never;

    await expect(debitFundHoldingShares(db, fundId, corporationId, 25, 12)).resolves.toBe(true);

    expect(updateOne.mock.calls[0][0]).toMatchObject({
      _id: fundId,
      holdings: { $elemMatch: { corporationId, shares: { $gte: 25 } } },
    });
    expect(updateOne.mock.calls[0][1].$inc["holdings.$.shares"]).toBe(-25);
    expect(updateOne.mock.calls[1][1]).toEqual({
      $pull: {
        holdings: { corporationId: { $eq: corporationId }, shares: { $lte: 0 } },
      },
    });
  });

  it("does not mutate further when the sufficient-inventory guard fails", async () => {
    const updateOne = vi.fn().mockResolvedValue({ matchedCount: 0 });
    const findOne = vi.fn();
    const db = { collection: vi.fn(() => ({ updateOne, findOne })) } as never;

    await expect(debitFundHoldingShares(db, new ObjectId(), new ObjectId(), 25, 12)).resolves.toBe(
      false
    );
    expect(findOne).not.toHaveBeenCalled();
    expect(updateOne).toHaveBeenCalledOnce();
  });
});

describe("creditFundPosition", () => {
  it("updates weighted average NAV when crediting an existing position", async () => {
    const fundId = new ObjectId();
    const characterId = new ObjectId();
    const updatedPosition = {
      _id: new ObjectId(),
      fundId,
      holderKind: "character",
      characterId,
      units: 15,
      avgNavAnchor: 11.33,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const findOneAndUpdate = vi.fn().mockResolvedValue(updatedPosition);
    const insertOne = vi.fn();
    const db = {
      collection: vi.fn(() => ({ findOneAndUpdate, insertOne })),
    } as never;

    const result = await creditFundPosition(db, fundId, "character", { characterId }, 5, 12);

    expect(result).toBe(updatedPosition);
    expect(insertOne).not.toHaveBeenCalled();
    const updatePipeline = findOneAndUpdate.mock.calls[0][1] as unknown[];
    expect(updatePipeline).toEqual([
      expect.objectContaining({
        $set: expect.objectContaining({
          avgNavAnchor: expect.any(Object),
          units: { $add: ["$units", 5] },
        }),
      }),
    ]);
    expect(JSON.stringify(updatePipeline)).toContain("60");
  });
});

describe("updateFundNavsBulk", () => {
  async function seeded() {
    const { createInMemoryDb } = await import("@/lib/test-utils/inMemoryDb");
    const memory = createInMemoryDb();
    const ids = [new ObjectId(), new ObjectId(), new ObjectId()];
    const doc = (_id: ObjectId) => ({
      _id,
      quotedNav: 100,
      backingRatio: 1,
      unitSupply: 10,
      cashAnchor: 500,
      holdings: [],
      updatedAt: new Date(0),
    });
    memory.seed("indexFunds", ids.map(doc) as never);
    return { memory, ids };
  }

  it("stores the same fields as one updateFundNav call per fund", async () => {
    const { updateFundNav, updateFundNavsBulk } = await import("./fundQueries");
    const updates = [
      { quotedNav: 101.5, backingRatio: 1.02 },
      { quotedNav: 99, backingRatio: 0.97, unitSupply: 12 },
      { quotedNav: 100 },
    ];
    const single = await seeded();
    for (const [i, update] of updates.entries())
      await updateFundNav(single.memory as never, single.ids[i]!, update);
    const bulk = await seeded();
    await updateFundNavsBulk(
      bulk.memory as never,
      updates.map((update, i) => ({ fundId: bulk.ids[i]!, update }))
    );
    const strip = (docs: Array<Record<string, unknown>>) =>
      docs.map(({ _id: _ignored, updatedAt, ...rest }) => ({
        ...rest,
        touched: (updatedAt as Date).getTime() > 0,
      }));
    expect(strip(bulk.memory.collection("indexFunds").docs)).toEqual(
      strip(single.memory.collection("indexFunds").docs)
    );
  });

  it("is a single bulk command and skips the call for an empty batch", async () => {
    const { countRoundTrips } = await import("@/lib/test-utils/roundTripCounter");
    const { updateFundNavsBulk } = await import("./fundQueries");
    const { memory, ids } = await seeded();
    const trips = countRoundTrips(memory);
    await updateFundNavsBulk(memory as never, []);
    expect(trips.total()).toBe(0);
    await updateFundNavsBulk(
      memory as never,
      ids.map((fundId) => ({ fundId, update: { quotedNav: 1 } }))
    );
    expect(trips.count("indexFunds")).toBe(1);
  });
});
