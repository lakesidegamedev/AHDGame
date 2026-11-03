import { describe, expect, it } from "vitest";
import {
  advancePlantLedger,
  plantCapacityDeltaPipeline,
  seedPlantLedger,
  splitWholePlantCount,
} from "./plantLedger";

describe("seedPlantLedger", () => {
  it("matches the existing whole-facility presentation without changing stock", () => {
    expect(seedPlantLedger({ sectorType: "energy" }, 999)).toEqual({
      plantCount: 3,
      plantUnitRemainder: 249,
    });
    expect(seedPlantLedger({ sectorType: "energy" }, 12)).toEqual({
      plantCount: 1,
      plantUnitRemainder: 0,
    });
    expect(seedPlantLedger({ sectorType: "energy" }, 0)).toEqual({
      plantCount: 0,
      plantUnitRemainder: 0,
    });
  });

  it("keeps the legacy one-unit vehicle facility quantum on a manufacturing model", () => {
    const ledger = seedPlantLedger({ sectorType: "manufacturing", industryModel: "vehicles" }, 3.7);
    expect(ledger.plantCount).toBe(3);
    expect(ledger.plantUnitRemainder).toBeCloseTo(0.7);
    expect(
      plantCapacityDeltaPipeline(
        { sectorType: "manufacturing", industryModel: "vehicles" },
        1,
        {}
      )[1]?.$set
    ).toMatchObject({
      plantCount: {
        $cond: [
          { $lte: ["$capitalStock", 0] },
          0,
          {
            $cond: [
              { $lt: ["$capitalStock", 1] },
              1,
              { $floor: { $divide: ["$capitalStock", 1] } },
            ],
          },
        ],
      },
    });
  });
});

describe("vehicle recipe on a plain manufacturing sector", () => {
  const sector = { sectorType: "manufacturing", strategyId: "vehicle_assembly" };

  it("seeds the ledger on the vehicle plant size", () => {
    const ledger = seedPlantLedger(sector, 41.7);
    expect(ledger.plantCount).toBe(41);
    expect(ledger.plantUnitRemainder).toBeCloseTo(0.7);
    expect(ledger).toEqual(
      seedPlantLedger({ sectorType: "manufacturing", industryModel: "vehicles" }, 41.7)
    );
  });

  it("derives the atomic pipeline count on the same size", () => {
    const set = plantCapacityDeltaPipeline(sector, 1)[1]?.$set as Record<string, unknown>;
    expect(JSON.stringify(set.plantCount)).toContain('"$divide":["$capitalStock",1]');
  });
});

describe("advancePlantLedger", () => {
  it("combines fractional deliveries into whole plants", () => {
    const first = advancePlantLedger({
      sector: { sectorType: "energy" },
      plantCount: 10,
      plantUnitRemainder: 200,
      currentCapitalStock: 0,
      deliveredUnits: 100,
    });
    expect(first).toEqual({ plantCount: 11, plantUnitRemainder: 50 });

    const second = advancePlantLedger({
      sector: { sectorType: "energy" },
      ...first,
      currentCapitalStock: 0,
      deliveredUnits: 450,
    });
    expect(second).toEqual({ plantCount: 13, plantUnitRemainder: 0 });
  });

  it("self-seeds rows that missed the migration", () => {
    expect(
      advancePlantLedger({
        sector: { sectorType: "retail" },
        plantCount: undefined,
        plantUnitRemainder: undefined,
        currentCapitalStock: 800,
        deliveredUnits: 80,
      })
    ).toEqual({ plantCount: 11, plantUnitRemainder: 0 });
  });
});

describe("splitWholePlantCount", () => {
  it("allocates only whole plants and conserves the opening count", () => {
    expect(splitWholePlantCount(101, 0.25)).toEqual({ carved: 25, kept: 76 });
    expect(splitWholePlantCount(3, 0.1)).toEqual({ carved: 1, kept: 2 });
    expect(splitWholePlantCount(3, 0)).toEqual({ carved: 0, kept: 3 });
    expect(splitWholePlantCount(3, 1)).toEqual({ carved: 3, kept: 0 });
  });
});

describe("plantCapacityDeltaPipeline", () => {
  it("derives count and remainder from the post-delta stock in a later atomic stage", () => {
    const pipeline = plantCapacityDeltaPipeline({ sectorType: "energy" }, 120, {
      updatedAt: "now",
    });
    expect(pipeline).toHaveLength(2);
    expect(pipeline[0]).toEqual({
      $set: {
        capitalStock: {
          $max: [0, { $add: [{ $ifNull: ["$capitalStock", 0] }, 120] }],
        },
      },
    });
    expect(pipeline[1]).toMatchObject({
      $set: {
        updatedAt: "now",
        plantCount: {
          $cond: [
            { $lte: ["$capitalStock", 0] },
            0,
            {
              $cond: [
                { $lt: ["$capitalStock", 250] },
                1,
                { $floor: { $divide: ["$capitalStock", 250] } },
              ],
            },
          ],
        },
      },
    });
    expect(pipeline[1]?.$set).toHaveProperty("plantUnitRemainder");
  });
});
