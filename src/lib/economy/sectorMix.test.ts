import { beforeEach, describe, expect, it, vi } from "vitest";
import { ObjectId } from "mongodb";
import type { Db } from "mongodb";
import { createMockDb, type MockDb } from "@/lib/test-utils/mockDb";
import { aggregateCountrySectorMix } from "./sectorMix";

vi.mock("@/lib/mongodb", () => ({ getDb: vi.fn() }));

let db: MockDb;

beforeEach(async () => {
  vi.clearAllMocks();
  db = createMockDb();
  [
    "states",
    "corporateSectors",
    "corporations",
    "exchangeRates",
    "commodityPrices",
    "gameConfig",
    "gameState",
  ].forEach((n) => db.collection(n));
  const { getDb } = await import("@/lib/mongodb");
  vi.mocked(getDb).mockResolvedValue(db as unknown as Db);
});

function mockFind(collection: string, docs: unknown[]) {
  db.collectionMocks[collection]!.find.mockReturnValue({
    toArray: async () => docs,
    project: vi.fn().mockReturnValue({ toArray: async () => docs }),
  });
}

describe("aggregateCountrySectorMix", () => {
  it("aggregates built capacity per sector across states and finds the largest state", async () => {
    const corpId = new ObjectId();
    mockFind("states", [
      { _id: "CA", countryId: "US", name: "California", gdp: 0, population: 30 },
      { _id: "TX", countryId: "US", name: "Texas", gdp: 0, population: 10 },
    ]);
    const sector = (stateId: string, revenue: number, units: number) => ({
      _id: new ObjectId(),
      corporationId: corpId,
      countryId: "US",
      stateId,
      sectorType: "energy",
      revenue,
      realizedRevenue: 0,
      capitalStock: units,
      operatingCapacityUnits: units,
      strategyId: "standard",
      mothballed: false,
    });
    mockFind("corporateSectors", [sector("CA", 600, 6), sector("TX", 100, 1)]);
    mockFind("commodityPrices", []);
    mockFind("corporations", [{ _id: corpId, liquidCurrencyCode: "USD", countryId: "US" }]);
    mockFind("exchangeRates", [{ _id: "US", currencyCode: "USD", rate: 1 }]);

    const mix = await aggregateCountrySectorMix(db as unknown as Db, "US");

    const energy = mix.find((s) => s.type === "energy")!;
    expect(energy.totalMarketAnchor).toBeGreaterThan(0);
    // With no latent demand every unit of market is built capacity.
    expect(energy.ownedPercent).toBe(100);
    expect(energy.largestState).toEqual({ stateId: "CA", stateName: "California" });
    expect(energy.avgGrowth).toBeNull();

    // A sector nobody operates still appears, zeroed, so boards stay complete.
    const financial = mix.find((s) => s.type === "financial")!;
    expect(financial.totalMarketAnchor).toBe(0);
    expect(financial.largestState).toBeNull();
  });

  it("returns a complete zeroed board when the country has no market data", async () => {
    mockFind("states", []);
    mockFind("corporateSectors", []);
    mockFind("corporations", []);
    mockFind("exchangeRates", []);

    const mix = await aggregateCountrySectorMix(db as unknown as Db, "US");

    expect(mix.length).toBeGreaterThan(0);
    expect(mix.every((s) => s.totalMarketAnchor === 0 && s.largestState === null)).toBe(true);
  });

  it("sizes plants markets from built capacity plus unmet commodity demand", async () => {
    mockFind("states", [{ _id: "CA", countryId: "US", name: "California", gdp: 0 }]);
    mockFind("corporateSectors", [
      {
        _id: new ObjectId(),
        corporationId: new ObjectId(),
        countryId: "US",
        stateId: "CA",
        sectorType: "manufacturing",
        // The owned nameplate is deliberately much smaller than the open
        // market. A plants board must not mistake ownership for the whole
        // industry.
        revenue: 10_000,
        realizedRevenue: 0,
        capitalStock: 2,
        operatingCapacityUnits: 2,
        strategyId: "vehicle_assembly",
        mothballed: false,
        currentGrowthRate: 0,
      },
    ]);
    mockFind("commodityPrices", [
      {
        commodity: "vehicles",
        basePrice: 25_000,
        globalPrice: 25_000,
        globalSupply: 0,
        globalDemand: 40,
        demandTruncatedUnits: 10,
        nationalSupply: { US: 0 },
        nationalDemand: { US: 40 },
        stateSupply: { CA: 0 },
        stateDemand: { CA: 40 },
        turn: 1,
      },
    ]);
    mockFind("corporations", []);
    mockFind("exchangeRates", []);
    db.collectionMocks.gameConfig!.findOne.mockResolvedValue({ marketSystemMode: "plants" });

    const mix = await aggregateCountrySectorMix(db as unknown as Db, "US");
    const vehicleMakers = mix.find((s) => s.type === "manufacturing")!;

    // Two built vehicle capacity units are $100,000 of plant nameplate.
    // The vehicle ledger has another 40 visible units plus 10 units that were
    // capped out of the price pass. On the vehicle capacity basis, those
    // 50 units are $2.5M of latent demand.
    expect(vehicleMakers.totalMarketAnchor).toBe(2_600_000);
    expect(vehicleMakers.ownedPercent).toBeCloseTo(3.8, 1);

    // Plants has no persisted target-growth signal; exposing 0.00% here would
    // claim a measured contraction/expansion that did not occur.
    expect(vehicleMakers.avgGrowth).toBeNull();
  });

  it("books no latent market in a surplus scope of a truncated commodity", async () => {
    mockFind("states", [{ _id: "CA", countryId: "US", name: "California", gdp: 0 }]);
    mockFind("corporateSectors", [
      {
        _id: new ObjectId(),
        corporationId: new ObjectId(),
        countryId: "US",
        stateId: "CA",
        sectorType: "manufacturing",
        revenue: 10_000,
        realizedRevenue: 0,
        capitalStock: 2,
        operatingCapacityUnits: 2,
        strategyId: "vehicle_assembly",
        mothballed: false,
        currentGrowthRate: 0,
      },
    ]);
    // Globally capped (60 units truncated) but locally clearing: true uncapped
    // demand is 10 + 60 = 70 against 100 supply, so the market has no latent
    // leg. Restoring the truncated share outside the max(0, demand - supply)
    // floor would book 60 phantom vehicle units ($3M) here instead.
    mockFind("commodityPrices", [
      {
        commodity: "vehicles",
        basePrice: 25_000,
        globalPrice: 25_000,
        globalSupply: 100,
        globalDemand: 10,
        demandTruncatedUnits: 60,
        nationalSupply: { US: 100 },
        nationalDemand: { US: 10 },
        stateSupply: { CA: 100 },
        stateDemand: { CA: 10 },
        turn: 1,
      },
    ]);
    mockFind("corporations", []);
    mockFind("exchangeRates", []);
    db.collectionMocks.gameConfig!.findOne.mockResolvedValue({ marketSystemMode: "plants" });

    const mix = await aggregateCountrySectorMix(db as unknown as Db, "US");
    const vehicleMakers = mix.find((s) => s.type === "manufacturing")!;

    // Owned nameplate only: two built units are $100,000 of plant.
    expect(vehicleMakers.totalMarketAnchor).toBe(100_000);
    expect(vehicleMakers.ownedPercent).toBe(100);
  });

  it("keeps latent physical buckets for a region with no local owned row", async () => {
    mockFind("states", [
      { _id: "CA", countryId: "US", name: "California", gdp: 0 },
      { _id: "TX", countryId: "US", name: "Texas", gdp: 0 },
    ]);
    mockFind("corporateSectors", [
      {
        _id: new ObjectId(),
        corporationId: new ObjectId(),
        countryId: "US",
        stateId: "CA",
        sectorType: "manufacturing",
        revenue: 10_000,
        capitalStock: 1,
        operatingCapacityUnits: 1,
        strategyId: "vehicle_assembly",
        mothballed: false,
      },
    ]);
    mockFind("commodityPrices", [
      {
        commodity: "vehicles",
        basePrice: 25_000,
        globalPrice: 25_000,
        globalSupply: 0,
        globalDemand: 10,
        nationalSupply: { US: 0 },
        nationalDemand: { US: 10 },
        stateSupply: { CA: 0, TX: 0 },
        stateDemand: { CA: 0, TX: 10 },
        turn: 1,
      },
    ]);
    mockFind("corporations", []);
    mockFind("exchangeRates", []);
    db.collectionMocks.gameConfig!.findOne.mockResolvedValue({ marketSystemMode: "plants" });

    const mix = await aggregateCountrySectorMix(db as unknown as Db, "US");
    const vehicles = mix.find((sector) => sector.type === "manufacturing")!;

    // CA contributes one $50k nameplate. TX has no persisted market row, but
    // its latent demand still expands the vehicles market physically.
    expect(vehicles.totalMarketAnchor).toBeGreaterThan(50_000);
    expect(vehicles.ownedPercent).toBeLessThan(100);
  });
});
