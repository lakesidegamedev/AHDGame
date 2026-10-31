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
      industryModel: null,
      mediaDiscriminator: null,
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
      industryModel: null,
      mediaDiscriminator: null,
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
