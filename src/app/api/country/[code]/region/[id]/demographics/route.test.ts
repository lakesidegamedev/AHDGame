import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Db } from "mongodb";
import { createMockDb, type MockDb } from "@/lib/test-utils/mockDb";

vi.mock("@/lib/mongodb", () => ({ getDb: vi.fn() }));

async function call(code: string, id: string) {
  const { GET } = await import("./route");
  return GET(new Request(`http://localhost/api/country/${code}/region/${id}/demographics`), {
    params: Promise.resolve({ code, id }),
  });
}

describe("region demographics route", () => {
  let db: MockDb;

  beforeEach(async () => {
    vi.clearAllMocks();
    db = createMockDb();
    db.collection("states");
    db.collection("gameState");
    db.collectionMocks.gameState!.findOne.mockResolvedValue({
      _id: "current",
      preset: "2019-default",
    });
    const { getDb } = await import("@/lib/mongodb");
    vi.mocked(getDb).mockResolvedValue(db as unknown as Db);
  });

  it("returns census bucket sections that partition the electorate", async () => {
    db.collectionMocks.states!.findOne.mockResolvedValue({
      _id: "CT",
      countryId: "US",
      name: "Connecticut",
      cachedEconomicLean: 0.4,
      cachedSocialLean: -0.2,
    });
    const res = await call("us", "CT");
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.calculatedEconomicLean).toBe(0.4);
    expect(json.calculatedSocialLean).toBe(-0.2);
    expect(json.sections.length).toBeGreaterThan(0);
    for (const section of json.sections) {
      const total = section.rows.reduce(
        (s: number, r: { population: number }) => s + r.population,
        0
      );
      expect(total).toBeCloseTo(100, 6);
      for (const row of section.rows) {
        expect(Number.isFinite(row.economicLean)).toBe(true);
        expect(row.id.startsWith(`${section.id}:`)).toBe(true);
      }
    }
  });

  it("derives a lean from the buckets when the state has no cached lean", async () => {
    db.collectionMocks.states!.findOne.mockResolvedValue({
      _id: "CT",
      countryId: "US",
      name: "Connecticut",
    });
    const json = await (await call("us", "CT")).json();
    expect(Number.isFinite(json.calculatedEconomicLean)).toBe(true);
    expect(Math.abs(json.calculatedEconomicLean)).toBeLessThanOrEqual(5);
  });

  it("404s when the region has no census", async () => {
    db.collectionMocks.states!.findOne.mockResolvedValue({
      _id: "ZZ",
      countryId: "US",
      name: "Nowhere",
    });
    expect((await call("us", "ZZ")).status).toBe(404);
  });
});
