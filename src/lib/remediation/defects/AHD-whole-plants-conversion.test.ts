import { describe, expect, it } from "vitest";
import { ObjectId } from "mongodb";
import { convertSector, needsConversion } from "./AHD-whole-plants-conversion";
import { isWholePlantStock } from "@/lib/corporations/wholePlants/rules";

const TURN = 500;
const sector = (over: Record<string, unknown> = {}) =>
  ({
    _id: new ObjectId(),
    corporationId: new ObjectId(),
    countryId: "US",
    stateId: "US-TX",
    sectorType: "manufacturing",
    strategyId: "standard",
    capitalStock: 110,
    capacityBookAnchor: 1100,
    buildQueue: [],
    ...over,
  }) as unknown as Parameters<typeof convertSector>[0];

describe("whole plants conversion", () => {
  it("recounts stock to whole plants and credits the part-plant at book", () => {
    const out = convertSector(sector(), {
      turn: TURN,
      listPricePerUnitAnchor: 1,
      cohort: "player",
    });
    expect(out.set.capitalStock).toBe(100);
    expect(out.set.plantCount).toBe(4);
    expect(out.set.plantWearUnits).toBe(0);
    expect(out.set.plantUnitRemainder).toBe(0);
    expect(out.stockCreditAnchor).toBeCloseTo(100, 9);
    expect(out.set.capacityBookAnchor).toBeCloseTo(1000, 9);
  });

  it("rounds a sector below one plant up to one plant for free", () => {
    const out = convertSector(sector({ capitalStock: 3, capacityBookAnchor: 30 }), {
      turn: TURN,
      listPricePerUnitAnchor: 1,
      cohort: "npp",
    });
    expect(out.set.capitalStock).toBe(25);
    expect(out.creditAnchor).toBe(0);
    expect(out.roundedUp).toBe(true);
  });

  it("recounts in-flight cash orders, keeps financed ones and stamps whole plants", () => {
    const cash = {
      unitsOrdered: 60,
      costPaidAnchor: 600,
      startTurn: TURN,
      onlineTurn: TURN + 10,
      smooth: true,
    };
    const financed = { ...cash, constructionLoanId: "loan" };
    const out = convertSector(sector({ capitalStock: 100, buildQueue: [cash, financed] }), {
      turn: TURN,
      listPricePerUnitAnchor: 1,
      cohort: "player",
    });
    const queue = out.set.buildQueue as Array<Record<string, unknown>>;
    expect(queue).toHaveLength(2);
    expect(queue[0]).toMatchObject({ unitsOrdered: 50, plantUnits: 25, startTurn: TURN });
    expect(queue[0].costPaidAnchor as number).toBeCloseTo(500, 9);
    expect(queue[1]).toBe(financed);
    expect(out.orderRefundAnchor).toBeCloseTo(100, 9);
    expect(out.financedOrdersKept).toBe(1);
    expect(out.set.constructionInProgressAnchor as number).toBeCloseTo(1100, 9);
  });

  it("AI owners round in-flight orders to the nearest plant, players floor and refund", () => {
    // 40 undelivered units on 25-unit plants: 1.6 plants.
    const cash = {
      unitsOrdered: 40,
      costPaidAnchor: 400,
      startTurn: TURN,
      onlineTurn: TURN + 10,
      smooth: true,
    };
    const base = { turn: TURN, listPricePerUnitAnchor: 1 };
    const player = convertSector(sector({ capitalStock: 100, buildQueue: [cash] }), {
      ...base,
      cohort: "player",
      aiOwned: false,
    });
    expect((player.set.buildQueue as Array<{ unitsOrdered: number }>)[0].unitsOrdered).toBe(25);
    expect(player.orderRefundAnchor).toBeCloseTo(150, 9);
    expect(player.orderFreeUnits).toBe(0);

    for (const cohort of ["npp", "state"] as const) {
      const ai = convertSector(sector({ capitalStock: 100, buildQueue: [cash] }), {
        ...base,
        cohort,
      });
      const queue = ai.set.buildQueue as Array<{ unitsOrdered: number; costPaidAnchor: number }>;
      expect(queue[0].unitsOrdered).toBe(50);
      expect(queue[0].costPaidAnchor).toBeCloseTo(400, 9);
      expect(ai.orderRefundAnchor).toBe(0);
      expect(ai.orderFreeUnits).toBeCloseTo(10, 9);
    }

    // An imperial CEO is not a character: AI rules even in the player cohort.
    const imperial = convertSector(sector({ capitalStock: 100, buildQueue: [cash] }), {
      ...base,
      cohort: "player",
      aiOwned: true,
    });
    expect(imperial.orderRefundAnchor).toBe(0);

    // Owned stock keeps the floor rule for AI owners too.
    const stock = convertSector(sector({ capitalStock: 45, capacityBookAnchor: 450 }), {
      ...base,
      cohort: "npp",
    });
    expect(stock.set.capitalStock).toBe(25);
    expect(stock.stockCreditAnchor).toBeCloseTo(200, 9);
  });

  it("is done once the sector is whole and stamped for this turn", () => {
    const s = sector();
    expect(needsConversion(s, TURN)).toBe(true);
    const out = convertSector(s, { turn: TURN, listPricePerUnitAnchor: 1, cohort: "player" });
    const after = sector({ ...out.set, wholePlantsConversion: { turn: TURN } });
    expect(needsConversion(after, TURN)).toBe(false);
    expect(isWholePlantStock(after.capitalStock, 25)).toBe(true);
    // A whole sector with no open orders needs nothing even unstamped.
    expect(needsConversion(sector({ capitalStock: 75 }), TURN)).toBe(false);
  });
});
