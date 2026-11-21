import { beforeEach, describe, expect, it } from "vitest";
import { ObjectId, type Db } from "mongodb";
import {
  commodityDominanceFor,
  commodityTollModels,
  loadCommodityDominanceContext,
} from "./commodityDominanceContext";
import { commodityDominanceMultiplier } from "./rules/commodityDominanceRamp";

let db: Db;
const TURN = 532;
const corpId = new ObjectId();
const retoolingSectorId = new ObjectId();
const diversifiedSectorId = new ObjectId();

beforeEach(async () => {
  const { createInMemoryDb } = await import("@/lib/test-utils/inMemoryDb");
  db = createInMemoryDb() as unknown as Db;
  await db.collection("gameConfig").insertOne({
    _id: "default" as never,
    commandEconomyEnabled: false,
    groupSizeCostsStage: 0,
  });
  await db.collection("corporations").insertOne({ _id: corpId, countryOwnerId: null });
  await db.collection("corporateSectors").insertMany([
    {
      _id: retoolingSectorId,
      corporationId: corpId,
      countryId: "JP",
      stateId: "CHU",
      sectorType: "extraction",
      strategyId: "iron_mining",
      transitionFromStrategyId: "standard",
      transitionStartTurn: TURN - 6,
      capitalStock: 1_000,
      buildQueue: [],
    },
    {
      _id: diversifiedSectorId,
      corporationId: corpId,
      countryId: "JP",
      stateId: "KAN",
      sectorType: "extraction",
      strategyId: "standard",
      transitionFromStrategyId: null,
      transitionStartTurn: null,
      capitalStock: 1_000,
      buildQueue: [],
    },
  ]);
  await db.collection("commodityPrices").insertMany([
    { commodity: "iron", globalDemand: 10_000 },
    { commodity: "coal", globalDemand: 10_000 },
    { commodity: "oil", globalDemand: 10_000 },
    { commodity: "rare_earth", globalDemand: 1_000 },
    { commodity: "natural_gas", globalDemand: 10_000 },
    { commodity: "timber", globalDemand: 10 },
  ]);
});

async function contextFor(sectorId: ObjectId) {
  const sector = await db.collection("corporateSectors").findOne({ _id: sectorId });
  const corporation = await db.collection("corporations").findOne({ _id: corpId });
  const ctx = await loadCommodityDominanceContext(db, {
    corporation: corporation!,
    sector: sector!,
    turn: TURN,
    currentYear: 2001,
  });
  expect(ctx).not.toBeNull();
  return ctx!;
}

describe("commodity dominance context", () => {
  it("prices a retooling order on the target mix, not the old byproduct mix", async () => {
    // Half-way through standard -> iron_mining. The live mix still carries
    // timber at 1.5%, which against a 10 unit/day market used to price a
    // 1,000 unit iron mine at thousands of times its base cost.
    const ctx = await contextFor(retoolingSectorId);
    expect(ctx.commodities).toEqual(["iron"]);
    const toll = commodityDominanceFor(ctx, 250);
    expect(toll.commodity).toBe("iron");
    expect(toll.ratio).toBeLessThan(0.5);
    expect(commodityDominanceMultiplier(toll.ratio)).toBe(1);
    expect(commodityTollModels(ctx).map((model) => model.commodity)).toEqual(["iron"]);
  });

  it("still counts every commodity for a diversified sector that is not retooling", async () => {
    const ctx = await contextFor(diversifiedSectorId);
    expect(ctx.commodities).toContain("timber");
    expect(commodityDominanceFor(ctx, 0).commodity).toBe("timber");
  });
});

describe("commodity dominance context for freight", () => {
  it("prices a logistics build on its own state's freight demand", async () => {
    const txId = new ObjectId();
    const caId = new ObjectId();
    await db.collection("corporateSectors").insertMany([
      {
        _id: txId,
        corporationId: corpId,
        countryId: "US",
        stateId: "TX",
        sectorType: "logistics",
        strategyId: "standard",
        capitalStock: 100,
        buildQueue: [],
      },
      {
        _id: caId,
        corporationId: corpId,
        countryId: "US",
        stateId: "CA",
        sectorType: "logistics",
        strategyId: "standard",
        capitalStock: 1_000_000,
        buildQueue: [],
      },
    ]);
    await db.collection("commodityPrices").insertMany([
      { commodity: "freight", globalDemand: 100, stateDemand: { TX: 1_000_000, CA: 50 } },
      { commodity: "consulting_services", globalDemand: 1_000_000_000 },
    ]);
    const ctx = await contextFor(txId);
    expect(ctx.targetStateId).toBe("TX");
    expect(ctx.stateDemand?.freight).toBe(1_000_000);
    const toll = commodityDominanceFor(ctx, 0);
    // The CA fleet does not count and TX demand dwarfs the TX fleet: no toll.
    expect(commodityDominanceMultiplier(toll.ratio)).toBe(1);
    const freightModel = commodityTollModels(ctx).find((m) => m.commodity === "freight");
    expect(freightModel?.demandUnits).toBe(1_000_000);
  });
});

describe("commodity dominance context with capped demand", () => {
  it("restores demand the ledger cap removed before measuring a clinic", async () => {
    const flId = new ObjectId();
    await db.collection("corporateSectors").insertOne({
      _id: flId,
      corporationId: corpId,
      countryId: "US",
      stateId: "FL",
      sectorType: "healthcare",
      strategyId: "standard",
      capitalStock: 0,
      buildQueue: [],
    });
    await db.collection("commodityPrices").insertMany([
      {
        commodity: "healthcare_services",
        globalDemand: 200,
        demandTruncatedUnits: 100_000,
        stateDemand: { FL: 0.2 },
      },
    ]);
    const ctx = await contextFor(flId);
    expect(ctx.demand.healthcare_services).toBeCloseTo(100_200);
    expect(ctx.stateDemand?.healthcare_services).toBeCloseTo(0.2 + 100_000 * (0.2 / 200));
    const toll = commodityDominanceFor(ctx, 5);
    expect(commodityDominanceMultiplier(toll.ratio)).toBe(1);
  });
});

describe("commodity dominance context for country-booked services", () => {
  const usId = new ObjectId();
  const stateIds = ["TX", "CA", "NY"];

  async function seedConstruction() {
    await db
      .collection("states")
      .insertMany(stateIds.map((id) => ({ _id: id as never, countryId: "US" })));
    await db.collection("corporateSectors").insertOne({
      _id: usId,
      corporationId: corpId,
      countryId: "US",
      stateId: "TX",
      sectorType: "construction",
      strategyId: "standard",
      capitalStock: 100,
      buildQueue: [],
    });
    await db.collection("commodityPrices").insertOne({
      commodity: "construction_services",
      turn: 22,
      globalDemand: 11_041,
      stateDemand: { TX: 5.36, CA: 2.11, NY: 0.34 },
    });
  }

  it("measures against the funded country book, not the state demand sum", async () => {
    await seedConstruction();
    await db.collection("gameState").insertOne({ _id: "current" as never, worldEpochId: "w1" });
    await db.collection("producerMarketOutcomes").insertOne({
      _id: "w1:22" as never,
      books: [
        {
          countryId: "US",
          commodity: "construction_services",
          supply: 17.32,
          demand: 5_876.79,
          imports: 0,
          exports: 0,
        },
      ],
    });
    const ctx = await contextFor(usId);
    expect(ctx.countryDemand?.construction_services).toBeCloseTo(5_876.79);
    const model = commodityTollModels(ctx).find((m) => m.commodity === "construction_services");
    expect(model?.demandUnits).toBeCloseTo(5_876.79);
    const toll = commodityDominanceFor(ctx, 0);
    // About 8 units of state demand would put a 100-capital firm far past half;
    // 5,877 does not.
    expect(toll.commodity).toBe("construction_services");
    expect(toll.ratio).toBeLessThan(0.5);
    expect(commodityDominanceMultiplier(toll.ratio)).toBe(1);
  });

  it("falls back to the state demand sum when no funded book was published", async () => {
    await seedConstruction();
    const ctx = await contextFor(usId);
    expect(ctx.countryDemand?.construction_services).toBeCloseTo(5.36 + 2.11 + 0.34);
  });
});
