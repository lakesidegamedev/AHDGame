import { describe, expect, it } from "vitest";
import {
  applyPlantChange,
  convertQueueToWholePlants,
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

  it("pools a sector's orders so small orders that add up keep their plants", () => {
    const out = convertQueueToWholePlants(
      [
        { undeliveredUnits: 10, undeliveredCost: 100, onlineTurn: 110 },
        { undeliveredUnits: 10, undeliveredCost: 100, onlineTurn: 105 },
        { undeliveredUnits: 40, undeliveredCost: 400, onlineTurn: 120 },
      ],
      { size: SIZE, currentTurn: 100, sectorHasPlants: true }
    );
    // 60 units: 2 plants, 10 units refunded at 10 per unit.
    expect(out.plants).toBe(2);
    expect(out.refundAnchor).toBeCloseTo(100, 9);
    // Running total by online turn: 10 at 105, 20 at 110, 60 at 120. Both
    // plants land with the turn-120 order.
    expect(out.orders[1]).toEqual({ kind: "cancel" });
    expect(out.orders[0]).toEqual({ kind: "cancel" });
    expect(out.orders[2]).toMatchObject({ kind: "rewrite", unitsOrdered: 50, startTurn: 100 });
    if (out.orders[2].kind !== "rewrite") throw new Error("expected rewrite");
    expect(out.orders[2].costPaidAnchor).toBeCloseTo(500, 9);
  });

  it("lands each plant with the order where the running total reaches it", () => {
    const out = convertQueueToWholePlants(
      [
        { undeliveredUnits: 30, undeliveredCost: 30, onlineTurn: 5 },
        { undeliveredUnits: 30, undeliveredCost: 30, onlineTurn: 9 },
      ],
      { size: SIZE, currentTurn: 1, sectorHasPlants: true }
    );
    expect(out.orders.map((o) => (o.kind === "rewrite" ? o.unitsOrdered : 0))).toEqual([25, 25]);
    expect(out.refundAnchor).toBeCloseTo(10, 9);
  });

  it("refunds orders below one plant, except the first plant of an empty sector", () => {
    const orders = [{ undeliveredUnits: 10, undeliveredCost: 80, onlineTurn: 9 }];
    expect(
      convertQueueToWholePlants(orders, { size: SIZE, currentTurn: 5, sectorHasPlants: true })
    ).toEqual({
      orders: [{ kind: "cancel" }],
      refundAnchor: 80,
      plants: 0,
      roundedUp: false,
      freeUnits: 0,
    });
    expect(
      convertQueueToWholePlants(orders, { size: SIZE, currentTurn: 5, sectorHasPlants: false })
    ).toEqual({
      orders: [{ kind: "rewrite", unitsOrdered: SIZE, costPaidAnchor: 80, startTurn: 5 }],
      refundAnchor: 0,
      plants: 1,
      roundedUp: true,
      freeUnits: 15,
    });
  });

  it("nearest rounding: half a plant or more rounds up free, less is refunded", () => {
    const up = convertQueueToWholePlants(
      [
        { undeliveredUnits: 30, undeliveredCost: 300, onlineTurn: 105 },
        { undeliveredUnits: 10, undeliveredCost: 100, onlineTurn: 110 },
      ],
      { size: SIZE, currentTurn: 100, sectorHasPlants: true, rounding: "nearest" }
    );
    // 40 units is 1.6 plants: rounds to 2, the second lands with the last order.
    expect(up.plants).toBe(2);
    expect(up.refundAnchor).toBe(0);
    expect(up.freeUnits).toBeCloseTo(10, 9);
    expect(up.orders.map((o) => (o.kind === "rewrite" ? o.unitsOrdered : 0))).toEqual([25, 25]);
    const paid = up.orders.reduce(
      (sum, o) => sum + (o.kind === "rewrite" ? o.costPaidAnchor : 0),
      0
    );
    expect(paid).toBeCloseTo(400, 9);

    const half = convertQueueToWholePlants(
      [{ undeliveredUnits: 12.5, undeliveredCost: 50, onlineTurn: 9 }],
      { size: SIZE, currentTurn: 5, sectorHasPlants: true, rounding: "nearest" }
    );
    expect(half).toMatchObject({ plants: 1, refundAnchor: 0, roundedUp: false });
    expect(half.orders[0]).toMatchObject({
      kind: "rewrite",
      unitsOrdered: SIZE,
      costPaidAnchor: 50,
    });

    const down = convertQueueToWholePlants(
      [{ undeliveredUnits: 35, undeliveredCost: 350, onlineTurn: 9 }],
      { size: SIZE, currentTurn: 5, sectorHasPlants: true, rounding: "nearest" }
    );
    // 1.4 plants rounds down; only the 10-unit remainder is refunded.
    expect(down.plants).toBe(1);
    expect(down.refundAnchor).toBeCloseTo(100, 9);
    expect(down.freeUnits).toBe(0);
  });

  it("nearest rounding below half a plant: refund, or the founding plant when empty", () => {
    const orders = [{ undeliveredUnits: 10, undeliveredCost: 80, onlineTurn: 9 }];
    const opts = { size: SIZE, currentTurn: 5, rounding: "nearest" as const };
    expect(convertQueueToWholePlants(orders, { ...opts, sectorHasPlants: true })).toMatchObject({
      plants: 0,
      refundAnchor: 80,
    });
    expect(convertQueueToWholePlants(orders, { ...opts, sectorHasPlants: false })).toMatchObject({
      plants: 1,
      refundAnchor: 0,
      roundedUp: true,
    });
  });
});
