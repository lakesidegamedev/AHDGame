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
  listWindingDownFunds,
  unionFundObjectIds,
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

  it("excludes winding_down funds from serviceable NAV/investing work", async () => {
    const toArray = vi.fn().mockResolvedValue([]);
    const sort = vi.fn().mockReturnValue({ toArray });
    const find = vi.fn().mockReturnValue({ sort });
    const db = { collection: vi.fn().mockReturnValue({ find }) } as never;

    await listServiceableFunds(db);

    const filter = find.mock.calls[0][0];
    expect(JSON.stringify(filter)).not.toContain("winding_down");
  });
});

describe("listWindingDownFunds", () => {
  it("queries only status winding_down with the shared fund projection", async () => {
    const toArray = vi.fn().mockResolvedValue([]);
    const sort = vi.fn().mockReturnValue({ toArray });
    const find = vi.fn().mockReturnValue({ sort });
    const db = { collection: vi.fn().mockReturnValue({ find }) } as never;

    await listWindingDownFunds(db);

    expect(find).toHaveBeenCalledWith(
      { status: "winding_down" },
      { projection: { floatSettlementPlan: 0 } }
    );
    expect(sort).toHaveBeenCalledWith({ scope: 1, kind: 1, countryId: 1, sectorType: 1 });
    expect(toArray).toHaveBeenCalledOnce();
  });
});

describe("unionFundObjectIds", () => {
  it("dedupes by string id and keeps first-seen order", () => {
    const a = new ObjectId();
    const b = new ObjectId();
    const aDup = ObjectId.createFromHexString(a.toHexString());
    expect(unionFundObjectIds([a, b], [aDup, b])).toEqual([a, b]);
  });

  it("includes winding_down ids that are absent from the serviceable list", () => {
    const active = new ObjectId();
    const winding = new ObjectId();
    expect(unionFundObjectIds([active], [winding]).map(String)).toEqual([
      String(active),
      String(winding),
    ]);
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
