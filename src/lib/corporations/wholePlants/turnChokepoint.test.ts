import { describe, expect, it } from "vitest";
import {
  advanceProducerCapacity,
  type ProducerCapacityState,
} from "@/lib/market/producerMarket/capacityRules";
import {
  computePlantsCapacity,
  type PlantsCapacityInput,
} from "@/lib/turn/corporation/sectorTurn/plantsCapacity";
import { plantChangePipeline, plantCapacityDeltaPipeline } from "@/lib/corporations/plantLedger";

const SIZE = 25; // manufacturing, standard recipe

const advance = (state: ProducerCapacityState, recessionCapacityFactor = 1) =>
  advanceProducerCapacity({
    state,
    turn: state.completedTurn + 1,
    activeFraction: 1,
    operatingRecipeRatio: 1,
    recessionCapacityFactor,
  });

describe("funded turn chokepoint", () => {
  it("keeps owned capacity a whole number of plants every turn", () => {
    let state: ProducerCapacityState = {
      completedTurn: 10,
      ownedDailyUnits: 4 * SIZE,
      paidBookAnchor: 400,
      buildQueue: [
        {
          unitsOrdered: 2 * SIZE,
          costPaidAnchor: 200,
          startTurn: 10,
          onlineTurn: 20,
          smooth: true,
          plantUnits: SIZE,
        },
      ],
      wholePlants: { plantUnits: SIZE, creditUnits: 0, wearUnits: 0 },
    };
    let removed = 0;
    for (let i = 0; i < 5000; i++) {
      const prior = state.ownedDailyUnits;
      const next = advance(state, i % 50 === 0 ? 0.9 : 1);
      expect(next.state.ownedDailyUnits % SIZE).toBe(0);
      expect(next.state.wholePlants!.wearUnits).toBeLessThan(SIZE);
      expect(next.state.ownedDailyUnits).toBeGreaterThanOrEqual(SIZE);
      if (next.state.ownedDailyUnits < prior + next.deliveredDailyUnits) removed++;
      // Per-plant book stays flat under whole-plant wear.
      if (
        next.state.ownedDailyUnits > 0 &&
        state.ownedDailyUnits > 0 &&
        next.deliveredDailyUnits === 0
      )
        expect(next.state.paidBookAnchor / next.state.ownedDailyUnits).toBeCloseTo(
          state.paidBookAnchor / state.ownedDailyUnits,
          9
        );
      state = next.state;
    }
    expect(removed).toBeGreaterThan(0);
    // Wear reaches the last plant and stops there.
    expect(state.ownedDailyUnits).toBe(SIZE);
  });

  it("is today's continuous behaviour when the stage is off", () => {
    const state: ProducerCapacityState = {
      completedTurn: 1,
      ownedDailyUnits: 110,
      paidBookAnchor: 330,
      buildQueue: [],
    };
    const next = advance(state, 0.97);
    expect(next.state.wholePlants).toBeUndefined();
    expect(next.state.ownedDailyUnits).not.toBe(
      Math.round(next.state.ownedDailyUnits / SIZE) * SIZE
    );
  });
});

function legacyInput(over: Partial<PlantsCapacityInput> = {}): PlantsCapacityInput {
  return {
    sector: {
      capitalStock: 4 * SIZE,
      capacityBookAnchor: 400,
      plantsStartTurn: 1,
      strategyId: "standard",
      sectorType: "manufacturing",
      plantWearUnits: 0,
      plantUnitRemainder: 0,
    } as PlantsCapacityInput["sector"],
    corp: { ceoType: "character" },
    plantsEnabled: true,
    isFlipTurn: false,
    preFlipNameplateRevenue: 0,
    strategySupply: { steel: 1 },
    eraUnitScale: 1,
    landedBuildUnits: 0,
    landedBuildCostAnchor: 0,
    capacityUnitPriceAnchor: 100,
    newRevenue: 0,
    currentTurn: 1000,
    governorRampTurns: 240,
    embargoLegacyMothball: false,
    ...over,
  };
}

describe("legacy turn chokepoint", () => {
  it("turns depreciation into wear and keeps the stock whole", () => {
    const r = computePlantsCapacity(legacyInput({ wholePlants: true }));
    expect(r.plantsOwnedCapacity).toBe(4 * SIZE);
    expect(r.plantWearUnits).toBeGreaterThan(0);
    expect(r.plantLedger).toEqual({ plantCount: 4, plantUnitRemainder: 0 });
    expect(r.capacityBookAnchor).toBe(400);
  });

  it("takes a plant off when wear fills, and the book with it", () => {
    const base = legacyInput({ wholePlants: true });
    const r = computePlantsCapacity({
      ...base,
      sector: { ...base.sector, plantWearUnits: SIZE - 0.001 },
    });
    expect(r.plantsOwnedCapacity).toBe(3 * SIZE);
    expect(r.capacityBookAnchor).toBeCloseTo(300, 9);
  });

  it("is unchanged with the stage off", () => {
    const off = computePlantsCapacity(legacyInput());
    const explicit = computePlantsCapacity(legacyInput({ wholePlants: false }));
    expect(off).toEqual(explicit);
    expect(off.plantWearUnits).toBeNull();
    expect(off.plantsOwnedCapacity).toBeLessThan(4 * SIZE);
  });
});

describe("plantChangePipeline", () => {
  const sector = { sectorType: "manufacturing", strategyId: "standard" };
  it("is the legacy pipeline when the stage is off", () => {
    expect(plantChangePipeline(sector, 12, { a: 1 })).toEqual(
      plantCapacityDeltaPipeline(sector, 12, { a: 1 })
    );
  });
  it("writes whole plants and credit when on", () => {
    const stages = plantChangePipeline(sector, 12, { a: 1 }, { wholePlants: true });
    const final = stages[2].$set as Record<string, unknown>;
    expect(final.a).toBe(1);
    expect(final.capitalStock).toBeDefined();
    expect(final.plantWearUnits).toBeDefined();
    expect(stages[3]).toEqual({ $unset: ["__wpBase", "__wpCredit", "__wpAdded"] });
  });
});
