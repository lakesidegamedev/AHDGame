import { describe, expect, it, vi } from "vitest";
import { ObjectId, type Db } from "mongodb";
import { assumeExtractionContracts } from "./assumeExtractionContracts";

describe("assumeExtractionContracts", () => {
  it("re-points only the absorbed holder's unrevoked contracts at the acquirer", async () => {
    const updateMany = vi.fn().mockResolvedValue({ modifiedCount: 2 });
    const db = { collection: vi.fn(() => ({ updateMany })) } as unknown as Db;
    const fromId = new ObjectId();
    const toId = new ObjectId();
    const now = new Date();

    const moved = await assumeExtractionContracts(db, { fromId, toId, now });

    expect(moved).toBe(2);
    expect(updateMany).toHaveBeenCalledWith(
      { corporationId: fromId, revokedTurn: { $exists: false } },
      { $set: { corporationId: toId, updatedAt: now } }
    );
  });
});
