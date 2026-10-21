import { beforeEach, describe, expect, it } from "vitest";
import type { Db } from "mongodb";
import { createMockDb, type MockDb } from "@/lib/test-utils/mockDb";
import { loadLossShareSignal, marketAdjustmentEnabled, recordLossShares } from "./signals";

describe("market adjustment signals", () => {
  let db: MockDb;
  beforeEach(() => {
    db = createMockDb();
  });

  it("is off unless the stage is set", async () => {
    db.collection("gameConfig");
    db.collectionMocks.gameConfig!.findOne.mockResolvedValue(null);
    expect(await marketAdjustmentEnabled(db as unknown as Db)).toBe(false);
    db.collectionMocks.gameConfig!.findOne.mockResolvedValue({ marketAdjustmentStage: 1 });
    expect(await marketAdjustmentEnabled(db as unknown as Db)).toBe(true);
  });

  it("records one loss share per country for the turn", async () => {
    db.collection("corporateSectors");
    db.collectionMocks.corporateSectors!.find.mockReturnValue({
      toArray: async () => [
        { countryId: "US", capitalStock: 60, producerSettlement: { turn: 5, profit: -1 } },
        { countryId: "US", capitalStock: 40, producerSettlement: { turn: 5, profit: 1 } },
      ],
    });
    db.collection("marketAdjustmentSignals");
    db.collectionMocks.marketAdjustmentSignals!.bulkWrite.mockResolvedValue({
      modifiedCount: 0,
      upsertedCount: 1,
    });
    expect(await recordLossShares(db as unknown as Db, 5)).toBe(1);
    const ops = db.collectionMocks.marketAdjustmentSignals!.bulkWrite.mock.calls[0][0];
    expect(ops).toHaveLength(1);
    expect(ops[0].updateOne.filter).toEqual({ _id: "US", lastTurn: { $ne: 5 } });
    expect(ops[0].updateOne.update.$push.points.$each[0].value).toBeCloseTo(0.6, 10);
  });

  it("treats an already-recorded turn as done, not as an error", async () => {
    db.collection("corporateSectors");
    db.collectionMocks.corporateSectors!.find.mockReturnValue({
      toArray: async () => [
        { countryId: "US", capitalStock: 10, producerSettlement: { turn: 5, profit: -1 } },
      ],
    });
    db.collection("marketAdjustmentSignals");
    db.collectionMocks.marketAdjustmentSignals!.bulkWrite.mockRejectedValue(
      Object.assign(new Error("dup"), {
        writeErrors: [{ code: 11000 }],
        result: { modifiedCount: 0, upsertedCount: 0 },
      })
    );
    expect(await recordLossShares(db as unknown as Db, 5)).toBe(0);
  });

  it("rethrows a real write failure", async () => {
    db.collection("corporateSectors");
    db.collectionMocks.corporateSectors!.find.mockReturnValue({
      toArray: async () => [
        { countryId: "US", capitalStock: 10, producerSettlement: { turn: 5, profit: -1 } },
      ],
    });
    db.collection("marketAdjustmentSignals");
    db.collectionMocks.marketAdjustmentSignals!.bulkWrite.mockRejectedValue(
      Object.assign(new Error("boom"), { writeErrors: [{ code: 121 }] })
    );
    await expect(recordLossShares(db as unknown as Db, 5)).rejects.toThrow("boom");
  });

  it("reads back the latest value and the history", async () => {
    db.collection("marketAdjustmentSignals");
    db.collectionMocks.marketAdjustmentSignals!.findOne.mockResolvedValue({
      _id: "US",
      points: [
        { turn: 1, value: 0.2 },
        { turn: 2, value: 0.5 },
      ],
    });
    expect(await loadLossShareSignal(db as unknown as Db, "US")).toEqual({
      current: 0.5,
      history: [0.2, 0.5],
    });
    db.collectionMocks.marketAdjustmentSignals!.findOne.mockResolvedValue(null);
    expect(await loadLossShareSignal(db as unknown as Db, "US")).toBeNull();
  });
});
