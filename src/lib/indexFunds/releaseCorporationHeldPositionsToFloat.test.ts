import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Db } from "mongodb";
import { ObjectId } from "mongodb";
import { createMockDb, type MockDb } from "@/lib/test-utils/mockDb";

vi.mock("./fundQueries", () => ({
  debitFundPosition: vi.fn(),
  creditFundPosition: vi.fn(),
}));

describe("releaseCorporationHeldIndexFundPositionsToFloat", () => {
  let db: MockDb;

  beforeEach(() => {
    vi.clearAllMocks();
    db = createMockDb();
  });

  it("does nothing when the corporation holds no fund positions", async () => {
    db.collection("indexFundPositions").find.mockReturnValue({
      toArray: vi.fn().mockResolvedValue([]),
    });

    const { releaseCorporationHeldIndexFundPositionsToFloat } =
      await import("./releaseCorporationHeldPositionsToFloat");
    const { debitFundPosition } = await import("./fundQueries");

    const result = await releaseCorporationHeldIndexFundPositionsToFloat(db as unknown as Db, [
      new ObjectId(),
    ]);

    expect(result).toEqual({ unitsReleased: 0, positionsReleased: 0 });
    expect(debitFundPosition).not.toHaveBeenCalled();
  });

  it("moves the corporation's units to each fund's reserve position", async () => {
    const corporationId = new ObjectId();
    const fundId = new ObjectId();

    db.collection("indexFundPositions").find.mockReturnValue({
      toArray: vi
        .fn()
        .mockResolvedValue([{ _id: new ObjectId(), fundId, corporationId, units: 2_500_000 }]),
    });
    db.collection("indexFunds").find.mockReturnValue({
      toArray: vi.fn().mockResolvedValue([{ _id: fundId, quotedNav: 103.5 }]),
    });

    const { releaseCorporationHeldIndexFundPositionsToFloat } =
      await import("./releaseCorporationHeldPositionsToFloat");
    const { debitFundPosition, creditFundPosition } = await import("./fundQueries");
    vi.mocked(debitFundPosition).mockResolvedValue({ ok: true } as never);

    const result = await releaseCorporationHeldIndexFundPositionsToFloat(db as unknown as Db, [
      corporationId,
    ]);

    expect(debitFundPosition).toHaveBeenCalledWith(
      db,
      fundId,
      "corporation",
      { corporationId },
      2_500_000
    );
    expect(creditFundPosition).toHaveBeenCalledWith(
      db,
      fundId,
      "fund_reserve",
      {},
      2_500_000,
      103.5
    );
    expect(result).toEqual({ unitsReleased: 2_500_000, positionsReleased: 1 });
  });

  it("skips a position whose unit count changed under it", async () => {
    const corporationId = new ObjectId();
    const fundId = new ObjectId();

    db.collection("indexFundPositions").find.mockReturnValue({
      toArray: vi
        .fn()
        .mockResolvedValue([{ _id: new ObjectId(), fundId, corporationId, units: 40 }]),
    });

    const { releaseCorporationHeldIndexFundPositionsToFloat } =
      await import("./releaseCorporationHeldPositionsToFloat");
    const { debitFundPosition, creditFundPosition } = await import("./fundQueries");
    vi.mocked(debitFundPosition).mockResolvedValue({ ok: false } as never);

    const result = await releaseCorporationHeldIndexFundPositionsToFloat(db as unknown as Db, [
      corporationId,
    ]);

    expect(creditFundPosition).not.toHaveBeenCalled();
    expect(result).toEqual({ unitsReleased: 0, positionsReleased: 0 });
  });
});
