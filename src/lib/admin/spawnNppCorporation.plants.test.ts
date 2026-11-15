/**
 * The SEED/ADMIN spawn path under plants.
 *
 * Unlike a player's `expandSector` (or the NPP turn behaviour), this path grants
 * capacity directly into `capitalStock` rather than queueing a build: a world is
 * seeded at t0, there is no turn on which a queue could drain, and a spawned
 * corp whose plants were all still under construction would start a world
 * producing nothing. The grant is the same standard opening size in every
 * country and region.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Db } from "mongodb";
import { ObjectId } from "mongodb";
import { createMockDb, type MockDb } from "@/lib/test-utils/mockDb";
import { nppOpeningUnits } from "@/lib/admin/seed/rules/nppOpeningSize";
import { capacityRescaleRatio } from "@/lib/constants/capacityEconomy";
import { autoGrantedNodeIds } from "@/lib/constants/techTree";

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
  loadWorldPreset: vi.fn().mockResolvedValue("1953-default"),
  getGdpAnchorRate: vi.fn().mockReturnValue(1),
  loadWorldEraUnitScale: vi.fn().mockResolvedValue(1),
}));
vi.mock("@/lib/constants/sectorSeedEra", () => ({
  getEraNominalScale: vi.fn().mockReturnValue(1),
  // Modern share base (scale 1), matching getEraNominalScale above.
  getEraFounderShares: vi.fn((shares: number) => shares),
}));
vi.mock("./nppCorpCeoSelection", () => ({
  buildCeoAffiliations: vi.fn().mockReturnValue([]),
  chooseNppCorpCeo: vi.fn().mockReturnValue({ kind: "new", party: null }),
}));
vi.mock("@/lib/market/featureFlag", () => ({
  getMarketSystemModeForDb: vi.fn().mockResolvedValue("plants"),
  marketAtLeast: vi.fn().mockReturnValue(true),
}));

const OPENING_UNITS = nppOpeningUnits("manufacturing");

describe("spawnNppCorporation — plants", () => {
  let db: MockDb;

  beforeEach(() => {
    vi.clearAllMocks();
    db = createMockDb();
    for (const name of [
      "states",
      "npps",
      "corporations",
      "corporateSectors",
      "politicalParties",
      "gameState",
    ]) {
      db.collection(name);
      const cursor = {
        toArray: vi.fn().mockResolvedValue([]),
        project: vi.fn(() => cursor),
        sort: vi.fn(() => cursor),
        limit: vi.fn(() => cursor),
      };
      db.collectionMocks[name]!.find = vi.fn().mockReturnValue(cursor);
    }
    db.collectionMocks.states!.findOne.mockResolvedValue({
      _id: "CA",
      countryId: "US",
      name: "California",
      gdp: 1_000_000_000,
    });
    db.collectionMocks.gameState!.findOne.mockResolvedValue({
      _id: "current",
      sectorTechTreesEnabled: true,
      currentYear: 1953,
      currentTurn: 1,
      startingYear: 1953,
    });
  });

  async function spawn(plants: boolean) {
    const { marketAtLeast } = await import("@/lib/market/featureFlag");
    vi.mocked(marketAtLeast).mockReturnValue(plants);
    const { spawnNppCorporation } = await import("./spawnNppCorporation");
    await spawnNppCorporation(db as unknown as Db, {
      name: "Spawnco",
      type: "manufacturing",
      countryId: "US",
      headquartersState: "CA",
    });
    return {
      sector: db.collectionMocks.corporateSectors!.insertOne.mock.calls[0][0] as Record<
        string,
        unknown
      >,
    };
  }

  it("stamps no growth target under plants — births grow via build orders", async () => {
    await spawn(true);
    await spawn(false);
    // One shared mock DB per test, so the two spawns are calls 0 and 1.
    const inserts = db.collectionMocks.corporateSectors!.insertOne.mock.calls;
    expect((inserts[0]![0] as Record<string, unknown>).targetGrowthRate).toBe(0);
    expect((inserts[1]![0] as Record<string, unknown>).targetGrowthRate).toBe(3);
  });

  it("grants capacity directly into capitalStock, in UNITS", async () => {
    const { sector } = await spawn(true);
    expect(sector.capitalStock).toBeCloseTo(OPENING_UNITS, 6);
    // Seed context: instant, so nothing is queued.
    expect(sector.buildQueue).toBeUndefined();
    expect(sector.plantsStartTurn).toBe(0);
  });

  it("grants passed-decade tech prerequisites to a new NPP corporation", async () => {
    await spawn(true);
    const corporation = db.collectionMocks.corporations!.insertOne.mock.calls[0][0] as Record<
      string,
      unknown
    >;

    expect(corporation.unlockedTechNodeIds).toEqual(autoGrantedNodeIds("manufacturing", 1953));
  });

  it("founds a focused extraction sector with strategy-normalized capacity", async () => {
    const { spawnNppCorporation } = await import("./spawnNppCorporation");
    await spawnNppCorporation(db as unknown as Db, {
      name: "Iron Mine",
      type: "extraction",
      countryId: "US",
      headquartersState: "CA",
      initialStrategyId: "iron_mining",
      foundedAtTurn: 10,
    });
    const sector = db.collectionMocks.corporateSectors!.insertOne.mock.calls[0][0] as Record<
      string,
      unknown
    >;
    const corporation = db.collectionMocks.corporations!.insertOne.mock.calls[0][0] as Record<
      string,
      unknown
    >;
    const expectedStandardUnits = nppOpeningUnits("extraction");

    expect(sector.strategyId).toBe("iron_mining");
    expect(corporation.ceoType).toBe("npp");
    expect((corporation.userId as ObjectId).toString()).toBe("000000000000000000000000");
    expect(sector.capitalStock).toBeCloseTo(
      expectedStandardUnits * capacityRescaleRatio("extraction", "standard", "iron_mining"),
      6
    );
    expect(sector.plantsStartTurn).toBe(10);
  });

  it("opens every corporation in a lane at the same size in every region", async () => {
    db.collectionMocks.states!.findOne.mockResolvedValue({
      _id: "WY",
      countryId: "US",
      name: "Wyoming",
      gdp: 1,
    });
    const { spawnNppCorporation } = await import("./spawnNppCorporation");
    for (const [name, state] of [
      ["Big", "CA"],
      ["Small", "WY"],
    ] as const) {
      await spawnNppCorporation(db as unknown as Db, {
        name,
        type: "manufacturing",
        countryId: "US",
        headquartersState: state,
      });
    }
    const granted = db.collectionMocks.corporateSectors!.insertOne.mock.calls.map(
      (call) => (call[0] as { capitalStock: number }).capitalStock
    );
    expect(granted).toEqual([OPENING_UNITS, OPENING_UNITS]);
  });

  it("caps the opening size at a deposit ceiling", async () => {
    const { spawnNppCorporation } = await import("./spawnNppCorporation");
    const { revenuePerCapacityUnit } = await import("@/lib/constants/capacityEconomy");
    const ceilingUnits = OPENING_UNITS / 4;
    await spawnNppCorporation(db as unknown as Db, {
      name: "Capped",
      type: "manufacturing",
      countryId: "US",
      headquartersState: "CA",
      maximumStartingRevenue: ceilingUnits * revenuePerCapacityUnit("manufacturing", 1),
    });
    const sector = db.collectionMocks.corporateSectors!.insertOne.mock
      .calls[0][0] as { capitalStock: number };
    expect(sector.capitalStock).toBeCloseTo(ceilingUnits, 6);
  });

  it("grants no capacity off plants", async () => {
    const { sector } = await spawn(false);
    expect(sector.capitalStock).toBeUndefined();
    expect(sector.plantsStartTurn).toBeUndefined();
  });
});
