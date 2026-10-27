/**
 * The per-turn idempotency read: which parts of this turn's primary snapshots
 * have already been recorded. It runs on every turn and every half-hour tick,
 * and must not pull each race's whole snapshot history to find them.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockDb, type MockDb } from "@/lib/test-utils/mockDb";
import type { Db } from "mongodb";

vi.mock("@/lib/mongodb", () => ({ getDb: vi.fn() }));
vi.mock("@/lib/countries/ru/rules/presidentialCampaign", () => ({
  usesLegacyPresidentialCampaign: () => false,
}));

describe("recordPrimarySnapshots", () => {
  let db: MockDb;
  const electionId = "507f1f77bcf86cd799439011";

  beforeEach(async () => {
    vi.clearAllMocks();
    db = createMockDb();
    const { getDb } = await import("@/lib/mongodb");
    vi.mocked(getDb).mockResolvedValue(db as unknown as Db);
    // createMockDb builds collection mocks lazily, so touch it first.
    db.collection("elections");
    db.collection("primarySnapshots");
    db.collectionMocks.elections.find.mockReturnValue({
      toArray: vi.fn().mockResolvedValue([
        {
          _id: electionId,
          countryId: "US",
          state: "NY",
          status: "upcoming",
          electionType: "house",
          seatId: "NY-1",
        },
      ]),
      project: vi.fn().mockReturnThis(),
      sort: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
    });
  });

  it("reads only this turn's recorded parts, with an electionId and turn bound", async () => {
    const { recordPrimarySnapshots } = await import("./primarySnapshots");

    const written = await recordPrimarySnapshots(new Date(), 120);

    expect(written).toBe(0);
    const [filter, options] = db.collectionMocks.primarySnapshots.find.mock.calls[0];
    expect(filter.turn).toBe(120);
    expect(filter.electionId).toHaveProperty("$in");
    expect(options).toEqual({ projection: { electionId: 1, slicePart: 1 } });
    expect(db.collectionMocks.primarySnapshots.insertMany).not.toHaveBeenCalled();
  });
});
