import { describe, expect, it, vi, beforeEach } from "vitest";
import { ObjectId } from "mongodb";
import type { Db } from "mongodb";
import { createMockDb, type MockDb } from "@/lib/test-utils/mockDb";

vi.mock("./nationalCorporation", () => ({
  resolveNationalCorporationForSector: vi.fn(),
}));

import { resolveNationalCorporationForSector } from "./nationalCorporation";
import { incrementNatCorpSectorRevenue } from "./seedToNatCorp";

const NAT_ID = new ObjectId();

describe("incrementNatCorpSectorRevenue", () => {
  let db: MockDb;
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(resolveNationalCorporationForSector).mockResolvedValue({ _id: NAT_ID } as never);
    db = createMockDb();
    db.collection("corporateSectors");
    db.collectionMocks.corporateSectors.findOne.mockResolvedValue(null);
    db.collectionMocks.corporateSectors.insertOne.mockResolvedValue({ insertedId: new ObjectId() });
  });

  it("inserts a new nat corp sector when none exists", async () => {
    const result = await incrementNatCorpSectorRevenue(db as unknown as Db, {
      countryId: "CN",
      stateId: "BJ",
      sectorType: "energy",
      revenueDelta: 5_000_000,
    });
    expect(result).toBe("insert");
    expect(db.collectionMocks.corporateSectors.insertOne).toHaveBeenCalled();
  });

  it("increments an existing nat corp sector", async () => {
    db.collectionMocks.corporateSectors.findOne.mockResolvedValue({
      _id: new ObjectId(),
      revenue: 1_000_000,
    });
    const result = await incrementNatCorpSectorRevenue(db as unknown as Db, {
      countryId: "CN",
      stateId: "BJ",
      sectorType: "energy",
      revenueDelta: 500_000,
    });
    expect(result).toBe("inc");
    expect(db.collectionMocks.corporateSectors.updateOne).toHaveBeenCalled();
  });
});
