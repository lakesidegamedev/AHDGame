import { beforeEach, describe, expect, it, vi } from "vitest";

// Fixture dbs carry no census rows; strict tiers are covered in governmentApproval.censusTier.test.ts.
vi.mock("@/lib/country/countryTier", () => ({
  loadCountryTiers: async () => ({ fullSimulationIds: [] }),
}));
import type { Db } from "mongodb";
import { createMockDb, type MockDb } from "@/lib/test-utils/mockDb";

vi.mock("@/lib/mongodb", () => ({ getDb: vi.fn() }));
vi.mock("@/lib/country/nationalApproval", () => ({ loadNationalApproval: vi.fn() }));

describe("region metrics route — approvalHistory", () => {
  let db: MockDb;

  beforeEach(async () => {
    vi.clearAllMocks();
    db = createMockDb();
    db.collection("states");
    db.collection("macroMetrics");
    db.collection("stateApprovalHistory");

    db.collectionMocks.states!.findOne.mockResolvedValue({
      _id: "CA",
      countryId: "US",
      name: "California",
      population: 1000,
    });
    db.collectionMocks.macroMetrics!.findOne.mockImplementation((filter: { _id: string }) =>
      Promise.resolve(
        filter._id === "CA"
          ? { _id: "CA", countryId: "US", economic: { unemploymentRate: { value: 5 } } }
          : null
      )
    );
    db.collectionMocks.stateApprovalHistory!.findOne.mockResolvedValue({
      _id: "CA",
      stateId: "CA",
      countryId: "US",
      approvalRating: 50,
      history: [
        { turn: 1, approval: 48, net: -4 },
        { turn: 2, approval: 50, net: 0 },
      ],
      updatedAt: new Date("2026-06-05T00:00:00.000Z"),
    });

    const { getDb } = await import("@/lib/mongodb");
    vi.mocked(getDb).mockResolvedValue(db as unknown as Db);
  });

  it.each([
    ["us", "ca_national"],
    ["ca", "federal"],
  ])("rejects another country's national scope: %s/%s", async (code, id) => {
    const { GET } = await import("./route");
    const response = await GET(
      new Request(`http://localhost/api/country/${code}/region/${id}/metrics`),
      {
        params: Promise.resolve({ code, id }),
      }
    );
    expect(response.status).toBe(404);
    expect(db.collectionMocks.macroMetrics!.findOne).not.toHaveBeenCalled();
  });

  it.each([
    ["us", "federal"],
    ["ca", "ca_national"],
  ])("uses national approval without a synthetic region electorate: %s", async (code, id) => {
    db.collectionMocks.macroMetrics!.findOne.mockResolvedValue({
      _id: id,
      countryId: code.toUpperCase(),
      economic: { unemploymentRate: { value: 5 } },
    });
    const { loadNationalApproval } = await import("@/lib/country/nationalApproval");
    vi.mocked(loadNationalApproval).mockResolvedValue({
      governmentApproval: 63,
      governmentApprovalBase: 58,
      history: [{ turn: 40, approval: 63, net: 26 }],
      modifiers: [],
      stateAverage: 63,
      nationalAdjustments: [],
    });
    const { GET } = await import("./route");
    const response = await GET(
      new Request(`http://localhost/api/country/${code}/region/${id}/metrics`),
      {
        params: Promise.resolve({ code, id }),
      }
    );
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.governmentApproval).toBe(63);
    expect(body.governmentApprovalBase).toBe(58);
    expect(body.approvalHistory).toEqual([{ turn: 40, approval: 63, net: 26 }]);
    expect(loadNationalApproval).toHaveBeenCalledWith(code.toUpperCase());
    expect(db.collectionMocks.stateDemographics).toBeUndefined();
  });

  it("returns the region's approval history", async () => {
    const { GET } = await import("./route");
    const res = await GET(new Request("http://localhost/api/country/us/region/CA/metrics"), {
      params: Promise.resolve({ code: "us", id: "CA" }),
    });
    const json = await res.json();
    expect(json.approvalHistory).toEqual([
      { turn: 1, approval: 48, net: -4 },
      { turn: 2, approval: 50, net: 0 },
    ]);
  });

  it("defaults approvalHistory to an empty array when no doc exists", async () => {
    db.collectionMocks.stateApprovalHistory!.findOne.mockResolvedValue(null);
    const { GET } = await import("./route");
    const res = await GET(new Request("http://localhost/api/country/us/region/CA/metrics"), {
      params: Promise.resolve({ code: "us", id: "CA" }),
    });
    const json = await res.json();
    expect(json.approvalHistory).toEqual([]);
  });
});
