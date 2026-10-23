import { beforeEach, describe, expect, it, vi } from "vitest";
import { ObjectId } from "mongodb";
import { createMockDb, type MockDb } from "@/lib/test-utils/mockDb";
vi.mock("@/lib/mongodb", () => ({ getDb: vi.fn() }));
vi.mock("@/lib/extraction/featureFlag", () => ({
  isProspectingEnabled: vi.fn().mockResolvedValue(true),
  isContractIssuanceEnabled: vi.fn().mockResolvedValue(true),
}));
import { getDb } from "@/lib/mongodb";
import { GET } from "./route";
let db: MockDb;
beforeEach(() => {
  db = createMockDb();
  vi.mocked(getDb).mockResolvedValue(db as never);
  db.collection("stateResourceCapacity").findOne.mockResolvedValue({
    stateId: "HB",
    countryId: "DE",
    resources: { oil: 1000 },
  });
  db.collection("extractionContracts").find.mockReturnValue({
    toArray: vi.fn().mockResolvedValue([
      {
        _id: new ObjectId(),
        stateId: "HB",
        countryId: "DE",
        corporationId: new ObjectId(),
        resource: "oil",
        share: 0.2,
        missedPayments: 2,
      },
    ]),
  });
});
describe("state extraction resource read", () => {
  it("scopes contracts and capacity to the requested country and keeps payment distress private", async () => {
    const response = await GET(
      new Request("http://localhost/api/states/HB/resources?countryId=DE"),
      { params: Promise.resolve({ id: "HB" }) }
    );
    expect(response.status).toBe(200);
    expect(db.collectionMocks.stateResourceCapacity.findOne).toHaveBeenCalledWith({
      stateId: "HB",
      countryId: "DE",
    });
    expect(db.collectionMocks.extractionContracts.find).toHaveBeenCalledWith(
      expect.objectContaining({ stateId: "HB", countryId: "DE" })
    );
    const json = await response.json();
    expect(json.contracts[0].missedPayments).toBeUndefined();
    expect(json.summary[0]).toMatchObject({
      resource: "oil",
      capacityPerTurn: 1000,
      contractedPct: 0.2,
    });
  });
  it("counts open tender headroom once across award activation without reducing open access early", async () => {
    const tenderId = "a".repeat(24);
    db.collection("governmentTenders").find.mockReturnValue({
      toArray: vi
        .fn()
        .mockResolvedValue([
          { _id: tenderId, terms: { type: "extraction", resource: "oil", share: 0.3 } },
        ]),
    });
    const response = await GET(
      new Request("http://localhost/api/states/HB/resources?countryId=DE"),
      { params: Promise.resolve({ id: "HB" }) }
    );
    expect((await response.json()).summary[0]).toMatchObject({
      contractedPct: 0.2,
      committedShare: 0.5,
      openAccessPct: 0.8,
    });
    const contract = {
      _id: new ObjectId(),
      countryId: "DE",
      stateId: "HB",
      corporationId: new ObjectId(),
      tenderId,
      resource: "oil",
      share: 0.3,
    };
    db.collection("extractionContracts").find.mockReturnValue({
      toArray: vi.fn().mockResolvedValue([contract]),
    });
    const awarded = await GET(
      new Request("http://localhost/api/states/HB/resources?countryId=DE"),
      { params: Promise.resolve({ id: "HB" }) }
    );
    expect((await awarded.json()).summary[0]).toMatchObject({
      contractedPct: 0.3,
      committedShare: 0.3,
      openAccessPct: 0.7,
    });
    expect(db.collectionMocks.governmentTenders.find).toHaveBeenCalledWith(
      expect.objectContaining({ countryId: "DE", "terms.stateId": "HB" }),
      expect.anything()
    );
  });
  it("rejects an invalid country", async () => {
    const response = await GET(
      new Request("http://localhost/api/states/HB/resources?countryId=invalid"),
      { params: Promise.resolve({ id: "HB" }) }
    );
    expect(response.status).toBe(400);
  });
});
