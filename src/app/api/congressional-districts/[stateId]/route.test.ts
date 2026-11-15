import { beforeEach, describe, expect, it, vi } from "vitest";
import { createInMemoryDb } from "@/lib/test-utils/inMemoryDb";
import { getDb } from "@/lib/mongodb";
import { GET } from "./route";
vi.mock("@/lib/mongodb", () => ({ getDb: vi.fn() }));
vi.mock("@/lib/gameState", () => ({
  getGameState: vi.fn(async () => ({ preset: "2027-default", redistrictingEnabled: true })),
}));
beforeEach(async () => {
  const db = createInMemoryDb();
  vi.mocked(getDb).mockResolvedValue(db as never);
  await db
    .collection("politicalParties")
    .insertOne({ _id: "us-party", countryId: "US", sequentialId: 1, abbreviation: "DEM" });
  await db
    .collection("politicalParties")
    .insertOne({ _id: "foreign-party", countryId: "UK", sequentialId: 1, abbreviation: "OTHER" });
  await db.collection("congressionalDistricts").insertOne({
    _id: "US_MT_1",
    countryId: "US",
    stateId: "MT",
    index: 1,
    holderParty: "1",
    holderCharacterId: null,
    holderNppId: null,
  });
});
describe("current district-party presentation", () => {
  it("resolves legacy IDs within the US party roster and keeps geometry provenance", async () => {
    const res = await GET(new Request("http://t"), { params: Promise.resolve({ stateId: "MT" }) });
    const body = await res.json();
    expect(body.redistricting.districts[0].holderParty).toBe("DEM");
    expect(body.districts).toHaveLength(2);
    expect(body.leanBasis).toBe("unavailable-neutral-rendering-fallback");
  });
});
