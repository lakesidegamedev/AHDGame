/**
 * `corporateSectors.revenue` denomination on the SEED/ADMIN spawn path.
 *
 * The field is stored in the sector's HOST-STATE currency; readers normalize it
 * with `readCorpEconomicAnchor` (÷ fx). This path used to write the ₳ figure
 * straight in, so a JP sector (fx ≈ 360) was read back at ~1/360 of its true
 * weight by every ₳-denominated aggregate — tax rollups, GDP weighting, market
 * share denominators, corp valuation. Capital mode hid it (the turn's
 * read → grow → write round-trips and cancels); plants exposes it.
 *
 * The invariant these tests pin: `revenue` is written in local currency, while
 * the ₳ quantity `startingRevenue`, which also drives the capacity grant, is
 * unchanged.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Db } from "mongodb";
import { ObjectId } from "mongodb";
import { createMockDb, type MockDb } from "@/lib/test-utils/mockDb";
// Load the spawn module graph at collection time. A cold import inside the
// first test can outlast its budget under load.
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
  // Modern share base (scale 1), matching getEraNominalScale above.
  getEraFounderShares: vi.fn((shares: number) => shares),
}));
vi.mock("./nppCorpCeoSelection", () => ({
  buildCeoAffiliations: vi.fn().mockReturnValue([]),
  chooseNppCorpCeo: vi.fn().mockReturnValue({ kind: "new", party: null }),
}));
vi.mock("@/lib/market/featureFlag", () => ({
  getMarketSystemModeForDb: vi.fn().mockResolvedValue("capital"),
  marketAtLeast: vi.fn().mockReturnValue(false),
}));

const JPY_RATE = 360;

describe("spawnNppCorporation — sector revenue denomination", () => {
  let db: MockDb;

  function setup(countryId: string, stateId: string, fxRate: number | null) {
    db = createMockDb();
    for (const name of [
      "states",
      "npps",
      "corporations",
      "corporateSectors",
      "politicalParties",
      "exchangeRates",
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
      _id: stateId,
      countryId,
      name: stateId,
      gdp: 1_000_000_000,
    });
    db.collectionMocks.exchangeRates!.find.mockReturnValue({
      toArray: async () =>
        fxRate == null ? [] : [{ currencyCode: countryId === "JP" ? "JPY" : "USD", rate: fxRate }],
    });
    db.collectionMocks.exchangeRates!.findOne.mockResolvedValue(
      fxRate == null ? null : { currencyCode: "X", rate: fxRate }
    );
  }

  async function spawn(countryId: string, stateId: string) {
    const result = await spawnNppCorporation(db as unknown as Db, {
      name: "Spawnco",
      type: "manufacturing",
      countryId: countryId as never,
      headquartersState: stateId,
    });
    return {
      result,
      sector: db.collectionMocks.corporateSectors!.insertOne.mock.calls[0][0] as Record<
        string,
        unknown
      >,
    };
  }

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("writes revenue in the host-state currency, not ₳", async () => {
    setup("JP", "KAN", JPY_RATE);
    const { sector, result } = await spawn("JP", "KAN");
    expect(result.startingRevenue).toBeGreaterThan(0);
    expect(sector.revenue).toBe(Math.round(result.startingRevenue * JPY_RATE));
  });

  it("round-trips back to the ₳ figure a reader expects", async () => {
    setup("JP", "KAN", JPY_RATE);
    const { sector, result } = await spawn("JP", "KAN");
    const { readCorpEconomicAnchor } = await import("@/lib/currency/corpEconomyFields");
    expect(readCorpEconomicAnchor(sector.revenue as number, "JPY", JPY_RATE)).toBeCloseTo(
      result.startingRevenue,
      0
    );
  });

  it("opens a small economy and a large one at the same ₳ size", async () => {
    setup("JP", "KAN", JPY_RATE);
    const small = await spawn("JP", "KAN");
    vi.clearAllMocks();
    setup("US", "CA", 1);
    const large = await spawn("US", "CA");
    expect(small.result.startingRevenue).toBe(large.result.startingRevenue);
  });

  it("is a no-op for an anchor-rate country (USD ≈ 1)", async () => {
    setup("US", "CA", 1);
    const { sector, result } = await spawn("US", "CA");
    expect(sector.revenue).toBe(result.startingRevenue);
  });

  it("passes through unchanged when no FX rate is on file", async () => {
    setup("US", "CA", null);
    const { sector, result } = await spawn("US", "CA");
    expect(sector.revenue).toBe(result.startingRevenue);
  });
});
