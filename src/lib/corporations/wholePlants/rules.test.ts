import { describe, expect, it } from "vitest";
import {
  applyPlantChange,
  convertOrderToWholePlants,
  convertSectorToWholePlants,
  floorUnitsToPlants,
  isWholePlantOrder,
  isWholePlantStock,
  snapToPlants,
  wholePlantsOn,
} from "./rules";
import {
  costReleasedThisTurn,
  deliveredFraction,
  undeliveredCost,
  undeliveredUnits,
  unitsDeliveredThisTurn,
} from "@/lib/corporations/buildDelivery";
import type { SectorBuildOrder } from "@/lib/db/types";

const SIZE = 25;

describe("whole plants switch", () => {
  it("is off when absent or 0", () => {
    expect(wholePlantsOn(undefined)).toBe(false);
    expect(wholePlantsOn(0)).toBe(false);
    expect(wholePlantsOn(1)).toBe(true);
  });
});

describe("snapToPlants", () => {
  it("floors to whole plants and returns the part-plant as credit", () => {
    expect(snapToPlants(110, SIZE)).toEqual({ plants: 4, creditUnits: 10 });
  });
  it("rounds a holding below one plant up to one plant", () => {
    expect(snapToPlants(3, SIZE)).toEqual({ plants: 1, creditUnits: 0 });
  });
  it("leaves an empty sector empty", () => {
    expect(snapToPlants(0, SIZE)).toEqual({ plants: 0, creditUnits: 0 });
  });
});

describe("applyPlantChange", () => {
  it("collects wear and takes off a whole plant when it reaches one plant", () => {
    let ledger = { capitalStock: 100, plantUnitRemainder: 0, plantWearUnits: 0 };
    const stocks: number[] = [];
    for (let turn = 0; turn < 10; turn++) {
      const next = applyPlantChange(ledger, SIZE, { lossUnits: 3 });
      stocks.push(next.capitalStock);
      expect(next.capitalStock % SIZE).toBe(0);
      expect(next.plantWearUnits).toBeLessThan(SIZE);
      ledger = next;
    }
    // 3 units of wear a turn: the 9th turn crosses one plant (27 >= 25).
    expect(stocks.slice(0, 8)).toEqual(Array(8).fill(100));
    expect(stocks[8]).toBe(75);
    expect(ledger.plantWearUnits).toBeCloseTo(5, 9);
  });

  it("never wears out the last plant", () => {
    let ledger = { capitalStock: SIZE, plantUnitRemainder: 0, plantWearUnits: 0 };
    for (let turn = 0; turn < 200; turn++) {
      ledger = applyPlantChange(ledger, SIZE, { lossUnits: 4 });
      expect(ledger.capitalStock).toBe(SIZE);
    }
    const heavy = applyPlantChange({ capitalStock: 2 * SIZE, plantWearUnits: 20 }, SIZE, {
      lossUnits: 10 * SIZE,
    });
    expect(heavy.plantCount).toBe(1);
    expect(heavy.plantWearUnits).toBe(0);
  });

  it("lets idle retirement take the last plant", () => {
    const out = applyPlantChange({ capitalStock: SIZE, plantWearUnits: 20 }, SIZE, {
      lossUnits: 5,
      protectLastPlant: false,
    });
    expect(out.capitalStock).toBe(0);
    expect(out.plantWearUnits).toBe(0);
    expect(out.bookRetention).toBe(0);
  });

  it("turns credit into a plant without raising the paid basis", () => {
    const out = applyPlantChange({ capitalStock: 50, plantUnitRemainder: 20 }, SIZE, {
      gainUnits: 7,
    });
    expect(out.capitalStock).toBe(75);
    expect(out.plantsAdded).toBe(1);
    expect(out.plantUnitRemainder).toBeCloseTo(2, 9);
    expect(out.bookRetention).toBe(1);
  });

  it("snaps a stray fractional stock to whole plants and keeps the surplus as credit", () => {
    const out = applyPlantChange({ capitalStock: 61.5 }, SIZE);
    expect(out.capitalStock).toBe(50);
    expect(out.plantUnitRemainder).toBeCloseTo(11.5, 9);
  });

  it("scales the basis by the share of plants still owned", () => {
    const out = applyPlantChange({ capitalStock: 100, plantWearUnits: 24 }, SIZE, {
      lossUnits: 2,
    });
    expect(out.plantCount).toBe(3);
    expect(out.bookRetention).toBeCloseTo(0.75, 12);
  });
});

describe("order sizing", () => {
  it("accepts only whole plants", () => {
    expect(isWholePlantOrder(50, SIZE)).toBe(true);
    expect(isWholePlantOrder(51, SIZE)).toBe(false);
    expect(isWholePlantOrder(10, SIZE)).toBe(false);
    expect(floorUnitsToPlants(74, SIZE)).toBe(50);
    expect(floorUnitsToPlants(24, SIZE)).toBe(0);
  });
});

describe("whole-plant build delivery", () => {
  const order: SectorBuildOrder = {
    unitsOrdered: 4 * SIZE,
    costPaidAnchor: 400,
    startTurn: 0,
    onlineTurn: 10,
    smooth: true,
    plantUnits: SIZE,
  };

  it("delivers whole plants only, the last on the online turn", () => {
    const delivered: number[] = [];
    for (let t = 1; t <= 10; t++) delivered.push(unitsDeliveredThisTurn(order, t));
    for (const units of delivered) expect(units % SIZE).toBe(0);
    expect(delivered.reduce((a, b) => a + b, 0)).toBe(100);
    // Plant k lands when the ramp passes k/4: turns 3 (0.3 >= 0.25), 5, 8, 10.
    expect(delivered).toEqual([0, 0, 25, 0, 25, 0, 0, 25, 0, 25]);
    expect(unitsDeliveredThisTurn(order, 11)).toBe(0);
  });

  it("releases cost and keeps construction in progress in the same plant steps", () => {
    let released = 0;
    for (let t = 1; t <= 10; t++) {
      released += costReleasedThisTurn(order, t);
      expect(released + undeliveredCost(order, t)).toBeCloseTo(400, 9);
      expect(undeliveredUnits(order, t) % SIZE).toBeCloseTo(0, 9);
    }
    expect(released).toBeCloseTo(400, 9);
    expect(deliveredFraction(order, 4)).toBe(0.25);
  });

  it("leaves unstamped orders on today's linear slices", () => {
    const linear = { ...order, plantUnits: undefined };
    expect(unitsDeliveredThisTurn(linear, 1)).toBeCloseTo(10, 9);
    expect(deliveredFraction(linear, 4)).toBeCloseTo(0.4, 12);
  });
});

describe("conversion", () => {
  it("recounts to whole plants and credits the part-plant at book cost", () => {
    const out = convertSectorToWholePlants({
      capitalStock: 110,
      capacityBookAnchor: 1100,
      listPricePerUnitAnchor: 999,
      size: SIZE,
    })!;
    expect(out.plants).toBe(4);
    expect(out.capitalStock).toBe(100);
    expect(out.remainderUnits).toBeCloseTo(10, 9);
    expect(out.creditAnchor).toBeCloseTo(100, 9);
    expect(out.capacityBookAnchor).toBeCloseTo(1000, 9);
    expect(isWholePlantStock(out.capitalStock, SIZE)).toBe(true);
  });

  it("rounds a sector below one plant up to one plant at no charge", () => {
    const out = convertSectorToWholePlants({
      capitalStock: 7,
      capacityBookAnchor: 70,
      listPricePerUnitAnchor: 10,
      size: SIZE,
    })!;
    expect(out).toMatchObject({ plants: 1, capitalStock: SIZE, creditAnchor: 0, roundedUp: true });
    expect(out.capacityBookAnchor).toBe(70);
  });

  it("falls back to list price when the sector has no recorded basis", () => {
    const out = convertSectorToWholePlants({
      capitalStock: 30,
      capacityBookAnchor: undefined,
      listPricePerUnitAnchor: 2,
      size: SIZE,
    })!;
    expect(out.creditAnchor).toBeCloseTo(10, 9);
  });

  it("skips empty sectors", () => {
    expect(
      convertSectorToWholePlants({
        capitalStock: 0,
        capacityBookAnchor: 0,
        listPricePerUnitAnchor: 1,
        size: SIZE,
      })
    ).toBeNull();
  });

  it("rewrites an in-flight order to whole plants and refunds the part-plant", () => {
    const out = convertOrderToWholePlants({
      undeliveredUnits: 60,
      undeliveredCost: 600,
      size: SIZE,
      currentTurn: 100,
      onlineTurn: 110,
      starterForEmptySector: false,
    });
    expect(out).toMatchObject({ kind: "rewrite", unitsOrdered: 50, startTurn: 100 });
    if (out.kind !== "rewrite") throw new Error("expected rewrite");
    expect(out.costPaidAnchor).toBeCloseTo(500, 9);
    expect(out.refundAnchor).toBeCloseTo(100, 9);
  });

  it("cancels and refunds an order below one plant, except a founding starter", () => {
    const base = {
      undeliveredUnits: 10,
      undeliveredCost: 80,
      size: SIZE,
      currentTurn: 5,
      onlineTurn: 9,
    };
    expect(convertOrderToWholePlants({ ...base, starterForEmptySector: false })).toEqual({
      kind: "cancel",
      refundAnchor: 80,
    });
    expect(convertOrderToWholePlants({ ...base, starterForEmptySector: true })).toMatchObject({
      kind: "rewrite",
      unitsOrdered: SIZE,
      costPaidAnchor: 80,
      refundAnchor: 0,
      roundedUp: true,
    });
  });
});
