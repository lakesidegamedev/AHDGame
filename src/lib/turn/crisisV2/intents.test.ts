import { ObjectId } from "mongodb";
import { beforeEach, describe, expect, it, vi } from "vitest";

const applyCrisisEffects = vi.hoisted(() => vi.fn());
vi.mock("@/lib/crises/applyEffects", () => ({ applyCrisisEffects }));
vi.mock("@/lib/livingConflict/capacityDestruction", () => ({
  applyCapacityDestructionSpec: vi.fn(async () => undefined),
}));
vi.mock("@/lib/livingConflict/crisisPopulationOrders", () => ({
  raiseCrisisPopulationOrders: vi.fn(async () => ({})),
}));

import type { EffectIntent } from "@/lib/crises/v2/effectModule";
import { routeEffectIntents, type IntentTargets } from "./intents";

function makeDb(claimModified = 1) {
  const collections = new Map<string, Record<string, ReturnType<typeof vi.fn>>>();
  const db = {
    collection(name: string) {
      let col = collections.get(name);
      if (!col) {
        col = {
          updateOne: vi.fn(async () => ({ modifiedCount: claimModified })),
          updateMany: vi.fn(async () => ({})),
          bulkWrite: vi.fn(async () => ({})),
        };
        collections.set(name, col);
      }
      return col;
    },
  };
  return { db: db as never, collections };
}

const crisisId = new ObjectId();
const targets = (extra: Partial<IntentTargets> = {}): IntentTargets => ({
  stateIds: ["s1", "s2"],
  countryIds: ["US"],
  crisisId,
  turn: 12,
  ...extra,
});

describe("routeEffectIntents", () => {
  beforeEach(() => applyCrisisEffects.mockReset());

  it("hands population, capital, trade and refugee intents to their writers", async () => {
    const { db } = makeDb();
    const intents: EffectIntent[] = [
      { kind: "populationLoss", fraction: 0.0001, countryId: "US" },
      { kind: "capitalStock", fraction: 0.01, regionId: "US_OH" },
      { kind: "tradeRestriction", commodity: "oil", targetRole: "belligerent", durationTurns: 5 },
      { kind: "migration", fraction: 0.001, fromCountryId: "YU" },
    ];
    const result = await routeEffectIntents(db, intents, targets());
    expect(result.unsupported).toEqual({});
    expect(applyCrisisEffects).not.toHaveBeenCalled();
  });

  it("records plant output cuts on the crisis, including commodity supply cuts", async () => {
    const { db } = makeDb();
    const intents: EffectIntent[] = [
      { kind: "plantCapacity", sectorType: "energy", factor: -0.1, scope: "output" },
      { kind: "commoditySupply", commodity: "oil", factor: -0.05 },
      { kind: "commoditySupply", commodity: "software", factor: -0.05 },
    ];
    const result = await routeEffectIntents(db, intents, targets());
    const output = result.v2Output!;
    expect(output.routedTurn).toBe(12);
    expect(output.productionCuts).toEqual([
      { sectorType: "energy", points: -10 },
      { sectorType: "extraction", points: -5 },
    ]);
    expect(result.unsupported).toEqual({ commoditySupply: 1 });
  });

  it("writes commodity demand as expiring modifiers with stable ids", async () => {
    const intents: EffectIntent[] = [
      { kind: "commodityDemand", commodity: "energy", factor: -0.04 },
    ];
    const first = makeDb();
    await routeEffectIntents(first.db, intents, targets({ countryIds: ["US", "UK"] }));
    const second = makeDb();
    await routeEffectIntents(second.db, intents, targets({ countryIds: ["US", "UK"] }));

    const ops = first.collections.get("countryModifiers")!.bulkWrite.mock.calls[0][0] as {
      updateOne: {
        filter: { _id: ObjectId };
        update: { $setOnInsert: Record<string, unknown> };
        upsert: boolean;
      };
    }[];
    expect(ops).toHaveLength(2);
    expect(ops[0].updateOne.upsert).toBe(true);
    expect(ops[0].updateOne.update.$setOnInsert).toMatchObject({
      kind: "sectorOutputDemandModifier",
      sectorType: "energy",
      pct: -4,
      appliedAtTurn: 12,
      expiresAtTurn: 14,
    });
    const replay = second.collections.get("countryModifiers")!.bulkWrite.mock
      .calls[0][0] as typeof ops;
    expect(replay.map((op) => op.updateOne.filter._id.toHexString())).toEqual(
      ops.map((op) => op.updateOne.filter._id.toHexString())
    );
  });

  it("adds fractional stress to active banks without a direct panic", async () => {
    const { db, collections } = makeDb();
    await routeEffectIntents(db, [{ kind: "bankStress", delta: 0.3 }], targets());
    const update = collections.get("corporations")!.updateMany;
    expect(update).toHaveBeenCalledTimes(1);
    const [filter, pipeline] = update.mock.calls[0] as unknown as [unknown, unknown[]];
    expect(filter).toEqual({ "bankCharter.status": "active", countryId: { $in: ["US"] } });
    expect(Array.isArray(pipeline)).toBe(true);
    expect(JSON.stringify(pipeline[0])).toContain("stressCarry");
    expect(JSON.stringify(pipeline[0])).toContain("0.3");
    // The panic only starts where the accumulated carry reaches a whole turn.
    expect(JSON.stringify(pipeline[1])).toContain("$gte");
  });

  it("sums stress from several intents into one bank update", async () => {
    const { db, collections } = makeDb();
    await routeEffectIntents(
      db,
      [
        { kind: "bankStress", delta: 1.4 },
        { kind: "bankStress", delta: 0.8 },
      ],
      targets()
    );
    const update = collections.get("corporations")!.updateMany;
    expect(update).toHaveBeenCalledTimes(1);
    const [, pipeline] = update.mock.calls[0] as unknown as [unknown, unknown[]];
    expect(JSON.stringify(pipeline[0])).toContain("2.2");
  });

  it("widens the borrowing premium by lowering investor confidence", async () => {
    const { db, collections } = makeDb();
    await routeEffectIntents(db, [{ kind: "bondYield", deltaBps: 100 }], targets());
    const update = collections.get("federalBudget")!.updateMany;
    expect(update).toHaveBeenCalledTimes(1);
    const [filter, pipeline] = update.mock.calls[0] as unknown as [
      unknown,
      { $set: Record<string, unknown> }[],
    ];
    expect(filter).toEqual({ countryId: { $in: ["US"] } });
    expect(JSON.stringify(pipeline[0].$set.investorConfidence)).toContain("23.33");
    expect(pipeline[0].$set.investorConfidenceUpdatedAtTurn).toBe(12);
  });

  it("moves regional unemployment and growth so the demographic flows move people", async () => {
    const { db } = makeDb();
    await routeEffectIntents(
      db,
      [
        { kind: "migration", fraction: 0.004, fromRegionId: "s1" },
        { kind: "migration", fraction: 0.002, toRegionId: "s2" },
      ],
      targets()
    );
    const calls = applyCrisisEffects.mock.calls.map(
      ([, effects, stateIds]) => [stateIds, effects[0].metricField, effects[0].value] as const
    );
    expect(calls).toEqual([
      [["s1"], "unemploymentRate", expect.closeTo(0.4)],
      [["s2"], "gdpGrowth", expect.closeTo(0.1)],
    ]);
  });

  it("folds approval and election swing into one approval write", async () => {
    const { db } = makeDb();
    await routeEffectIntents(
      db,
      [
        { kind: "approval", delta: -0.3 },
        { kind: "approval", delta: -0.4, group: "workers" },
        { kind: "electionSwing", deltaPoints: 0.3, incumbentOnly: true },
      ],
      targets()
    );
    expect(applyCrisisEffects).toHaveBeenCalledTimes(1);
    const effects = applyCrisisEffects.mock.calls[0][1];
    expect(effects).toHaveLength(1);
    expect(effects[0]).toMatchObject({ targetType: "approval" });
    expect(effects[0].value).toBeCloseTo(-0.3 - 0.2 - 0.4);
  });
});
