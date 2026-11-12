/**
 * Real company names on the NPP corporation creation path: a generated
 * placeholder becomes a real company in a modern world, an explicit name and
 * an earlier era keep what the caller passed.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Db } from "mongodb";
import { ObjectId } from "mongodb";
import { createMockDb, type MockDb } from "@/lib/test-utils/mockDb";
import { computeUnownedHeadroomUnits } from "@/lib/market/unownedHeadroom";
import { realCompanyNamesFor } from "@/lib/corporations/names/realNames";
import { spawnNppCorporation } from "./spawnNppCorporation";

vi.mock("@/lib/mongodb", () => ({ getDb: vi.fn() }));
vi.mock("@/lib/npp/generator", () => ({
  createNPP: vi.fn().mockResolvedValue({ _id: new ObjectId(), name: "Spawned NPP" }),
}));
vi.mock("@/lib/corporations/tickerSymbol", () => ({
  generateTickerSymbol: vi.fn().mockResolvedValue("SPWN"),
  insertCorporationWithTickerRetry: vi.fn(
    async (
      db: { collection: (name: string) => { insertOne: (doc: unknown) => Promise<unknown> } },
      corpDoc: unknown
    ) => {
      await db.collection("corporations").insertOne(corpDoc);
    }
  ),
}));
vi.mock("@/lib/db/sequentialId", () => ({
  getNextSequentialId: vi.fn().mockResolvedValue(42),
}));
vi.mock("@/lib/currency/gdpAnchorRate", () => ({
  loadWorldPreset: vi.fn().mockResolvedValue("2019-default"),
  getGdpAnchorRate: vi.fn().mockReturnValue(1),
  loadWorldEraUnitScale: vi.fn().mockResolvedValue(1),
}));
vi.mock("@/lib/constants/sectorSeedEra", () => ({
  getEraNominalScale: vi.fn().mockReturnValue(1),
  getEraFounderShares: vi.fn((shares: number) => shares),
}));
vi.mock("./nppCorpCeoSelection", () => ({
  buildCeoAffiliations: vi.fn().mockReturnValue([]),
  chooseNppCorpCeo: vi.fn().mockReturnValue({ kind: "new", party: null }),
}));
vi.mock("@/lib/admin/seed/seedUnownedSectors", () => ({
  computeUnownedSeedRevenue: vi.fn().mockReturnValue(0),
}));
vi.mock("@/lib/market/featureFlag", () => ({
  getMarketSystemModeForDb: vi.fn().mockResolvedValue("capital"),
  marketAtLeast: vi.fn().mockReturnValue(false),
}));

const POOL_REVENUE = 40_000_000;

describe("spawnNppCorporation real company names", () => {
  let db: MockDb;

  function setup(worldYear: number, existingNames: string[] = []) {
    db = createMockDb();
    for (const name of [
      "states",
      "npps",
      "corporations",
      "corporateSectors",
      "unownedSectors",
      "politicalParties",
      "exchangeRates",
      "gameState",
    ]) {
      db.collection(name);
      const rows = name === "corporations" ? existingNames.map((n) => ({ name: n })) : [];
      const cursor = {
        toArray: vi.fn().mockResolvedValue(rows),
        project: vi.fn(() => cursor),
        sort: vi.fn(() => cursor),
        limit: vi.fn(() => cursor),
      };
      db.collectionMocks[name]!.find = vi.fn().mockReturnValue(cursor);
    }
    db.collectionMocks.gameState!.findOne.mockResolvedValue({
      _id: "current",
      currentYear: worldYear,
      startingYear: worldYear,
      currentTurn: 1,
    });
    db.collectionMocks.states!.findOne.mockResolvedValue({
      _id: "CA",
      countryId: "US",
      name: "CA",
      gdp: 1_000_000_000,
    });
    db.collectionMocks.unownedSectors!.findOne.mockResolvedValue({
      _id: new ObjectId(),
      stateId: "CA",
      countryId: "US",
      sectorType: "technology",
      revenue: POOL_REVENUE,
      headroomUnits: computeUnownedHeadroomUnits("technology", POOL_REVENUE, 1),
    });
    db.collectionMocks.exchangeRates!.findOne.mockResolvedValue({ currencyCode: "X", rate: 1 });
  }

  async function spawn(realName?: "sector" | "bank") {
    const result = await spawnNppCorporation(db as unknown as Db, {
      name: "Copperline Logic Works",
      ...(realName ? { realName } : {}),
      type: "technology",
      countryId: "US" as never,
      headquartersState: "CA",
    });
    const corp = db.collectionMocks.corporations!.insertOne.mock.calls[0][0] as {
      name: string;
      logoUrl?: string;
    };
    return { result, corp };
  }

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("gives a generated name a real company in a modern world", async () => {
    setup(2027);
    const { result, corp } = await spawn("sector");
    expect(realCompanyNamesFor("US", "technology")).toContain(corp.name);
    expect(result.name).toBe(corp.name);
  });

  it("skips real names already in use", async () => {
    const pool = realCompanyNamesFor("US", "technology");
    setup(2027, pool.slice(1));
    const { corp } = await spawn("sector");
    expect(corp.name).toBe(pool[0]);
  });

  it("falls back to the generated name once the pool is used up", async () => {
    setup(2027, realCompanyNamesFor("US", "technology"));
    const { corp } = await spawn("sector");
    expect(corp.name).toBe("Copperline Logic Works");
    expect(corp.logoUrl).toBeUndefined();
  });

  it("keeps an explicit name", async () => {
    setup(2027);
    const { corp } = await spawn();
    expect(corp.name).toBe("Copperline Logic Works");
  });

  it("keeps generated names before the modern era", async () => {
    setup(1991);
    const { corp } = await spawn("sector");
    expect(corp.name).toBe("Copperline Logic Works");
  });
});
