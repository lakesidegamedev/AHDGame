import { describe, expect, it } from "vitest";
import {
  FUNDED_SALE_EVIDENCE_MAX_AGE_TURNS,
  fundedLowSaleStreakStep,
  fundedSellThrough,
  fundedTakenShare,
  nppDemandThrottle,
  nppOperatingCapacityUnits,
  nppSoldShare,
  soldShareFundedEpoch,
  soldShareWorldOf,
  type SoldShareWorld,
} from "./fundedSellThrough";
import {
  CHRONIC_LOW_FILL_THRESHOLD,
  decideExtractionStrategySwitch,
} from "@/lib/turn/npp/strategyExpectedRevenue";
import { STRANDED_LOW_FILL_THRESHOLD } from "@/lib/corporations/strandedPlant";
import { GLUT_MOTHBALL_FILL_THRESHOLD } from "@/lib/turn/npp/nppCorporationTuning";

const EPOCH = "epoch-1";
const receipt = (over: Record<string, unknown> = {}) => ({
  worldEpoch: EPOCH,
  capacityUnits: 100,
  offeredUnits: 40,
  soldUnits: 40,
  ...over,
});

describe("fundedSellThrough", () => {
  it("is sold over offered, clamped to [0, 1]", () => {
    expect(fundedSellThrough({ producerSettlement: receipt() }, EPOCH)).toBe(1);
    expect(fundedSellThrough({ producerSettlement: receipt({ soldUnits: 10 }) }, EPOCH)).toBe(0.25);
    expect(fundedSellThrough({ producerSettlement: receipt({ soldUnits: 50 }) }, EPOCH)).toBe(1);
  });

  it("has no reading without an offer or a receipt from this world", () => {
    expect(fundedSellThrough({}, EPOCH)).toBeNull();
    expect(fundedSellThrough({ producerSettlement: receipt({ offeredUnits: 0 }) }, EPOCH)).toBe(
      null
    );
    expect(
      fundedSellThrough({ producerSettlement: receipt({ worldEpoch: "old" }) }, EPOCH)
    ).toBeNull();
  });
});

describe("nppDemandThrottle", () => {
  it("reads the legacy throttle on a legacy world", () => {
    const sector = { demandThrottleFactor: 0.4, producerSettlement: receipt() };
    expect(nppDemandThrottle(sector, undefined)).toBe(0.4);
    expect(nppDemandThrottle({}, undefined)).toBeNull();
  });

  it("reads sell-through on a funded world, never the funded throttle", () => {
    expect(
      nppDemandThrottle({ demandThrottleFactor: 0.4, producerSettlement: receipt() }, EPOCH)
    ).toBe(1);
    expect(nppDemandThrottle({ demandThrottleFactor: 0.4 }, EPOCH)).toBeNull();
  });
});

describe("nppOperatingCapacityUnits", () => {
  it("takes daily capacity from the funded receipt", () => {
    const sector = { operatingCapacityUnits: 999, producerSettlement: receipt() };
    expect(nppOperatingCapacityUnits(sector, EPOCH)).toBe(2400);
    expect(nppOperatingCapacityUnits(sector, undefined)).toBe(999);
    expect(nppOperatingCapacityUnits({ operatingCapacityUnits: 999 }, EPOCH)).toBeNull();
  });
});

describe("fundedSellThrough freshness", () => {
  it("is no evidence when the receipt is older than the evidence window", () => {
    const sector = { producerSettlement: receipt({ turn: 98, soldUnits: 10 }) };
    expect(fundedSellThrough(sector, EPOCH, 99)).toBe(0.25);
    expect(
      fundedSellThrough(sector, EPOCH, 98 + FUNDED_SALE_EVIDENCE_MAX_AGE_TURNS + 1)
    ).toBeNull();
    expect(fundedSellThrough({ producerSettlement: receipt() }, EPOCH, 99)).toBeNull();
    expect(fundedSellThrough(sector, EPOCH)).toBe(0.25);
  });
});

describe("nppSoldShare", () => {
  const FUNDED: SoldShareWorld = { fundedWorldEpoch: EPOCH, firstFundedTurn: 2, turn: 50 };
  const fresh = (sold: number) => receipt({ turn: 50, soldUnits: sold });

  it("reads the funded sale on a funded turn, in both directions from the legacy figure", () => {
    expect(nppSoldShare({ soldFraction: 0.9, producerSettlement: fresh(4) }, FUNDED)).toBe(0.1);
    expect(nppSoldShare({ soldFraction: 0.1, producerSettlement: fresh(36) }, FUNDED)).toBe(0.9);
  });

  it("is null, never the legacy figure, without a current funded sale", () => {
    expect(nppSoldShare({ soldFraction: 0.1 }, FUNDED)).toBeNull();
    expect(
      nppSoldShare({ soldFraction: 0.1, producerSettlement: receipt({ turn: 40 }) }, FUNDED)
    ).toBeNull();
    expect(
      nppSoldShare(
        { soldFraction: 0.1, producerSettlement: receipt({ turn: 50, offeredUnits: 0 }) },
        FUNDED
      )
    ).toBeNull();
    expect(
      nppSoldShare(
        { soldFraction: 0.1, producerSettlement: receipt({ turn: 50, worldEpoch: "older" }) },
        FUNDED
      )
    ).toBeNull();
  });

  it("reads the legacy figure on a legacy world and before the first funded turn", () => {
    const sector = { soldFraction: 0.3, producerSettlement: fresh(40) };
    expect(nppSoldShare(sector, { turn: 50 })).toBe(0.3);
    expect(nppSoldShare(sector, { ...FUNDED, firstFundedTurn: 51 })).toBe(0.3);
    expect(nppSoldShare({}, { turn: 50 })).toBeNull();
  });
});

describe("soldShareWorldOf", () => {
  it("is funded only when the opening belongs to the current world", () => {
    const gs = { worldEpochId: EPOCH, producerOpening: { worldEpoch: EPOCH, turn: 1 } };
    expect(soldShareWorldOf(gs, 10)).toEqual({
      fundedWorldEpoch: EPOCH,
      firstFundedTurn: 2,
      turn: 10,
    });
    expect(soldShareFundedEpoch(soldShareWorldOf(gs, 1))).toBeNull();
    expect(soldShareFundedEpoch(soldShareWorldOf(gs, 2))).toBe(EPOCH);
    const stale = { worldEpochId: "new", producerOpening: { worldEpoch: EPOCH, turn: 1 } };
    expect(soldShareWorldOf(stale, 10)).toEqual({ turn: 10 });
    expect(soldShareWorldOf({ worldEpochId: EPOCH }, 10)).toEqual({ turn: 10 });
    expect(soldShareWorldOf(null, 10)).toEqual({ turn: 10 });
  });
});

describe("fundedLowSaleStreakStep", () => {
  it("extends under half sold, ends at half or more, and holds with no reading", () => {
    expect(fundedLowSaleStreakStep(0)).toBe("increment");
    expect(fundedLowSaleStreakStep(0.49)).toBe("increment");
    expect(fundedLowSaleStreakStep(0.5)).toBe("reset");
    expect(fundedLowSaleStreakStep(1)).toBe("reset");
    expect(fundedLowSaleStreakStep(null)).toBe("hold");
  });
});

describe("mine recipe switch input", () => {
  const strategies = [
    { id: "a", supply: { iron: 0.5 } },
    { id: "b", supply: { rare_earth: 0.58 } },
  ] as const;
  const decideFor = (world: SoldShareWorld, sector: Parameters<typeof nppSoldShare>[0]) =>
    decideExtractionStrategySwitch({
      currentStrategyId: "a",
      strategies,
      priceRatioOf: () => 1,
      headroomOf: () => 1,
      soldFraction: nppSoldShare(sector, world),
    });
  const FUNDED: SoldShareWorld = { fundedWorldEpoch: EPOCH, firstFundedTurn: 2, turn: 50 };

  it("lowers the bar on a low funded sale even when the legacy figure reads high", () => {
    const mine = { soldFraction: 0.9, producerSettlement: receipt({ turn: 49, soldUnits: 4 }) };
    expect(decideFor(FUNDED, mine)?.strategyId).toBe("b");
    expect(decideFor({ turn: 50 }, mine)).toBeNull();
  });

  it("keeps the full bar on a high funded sale even when the legacy figure reads low", () => {
    const mine = { soldFraction: 0.1, producerSettlement: receipt({ turn: 49, soldUnits: 40 }) };
    expect(decideFor(FUNDED, mine)).toBeNull();
    expect(decideFor({ turn: 50 }, mine)?.strategyId).toBe("b");
  });

  it("keeps the full bar without a current funded sale", () => {
    expect(decideFor(FUNDED, { soldFraction: 0.1 })).toBeNull();
  });
});

describe("own-site deliveries count as taken", () => {
  const world: SoldShareWorld = { fundedWorldEpoch: EPOCH, firstFundedTurn: 2, turn: 10 };
  // Every rule that reads the AI sold share: glut wage and output cap (chronic
  // low fill), glut mothballing, the stranded-divest gate and the low-sale
  // streak (which also feeds the contract glut discount through soldFraction).
  const flaggedBy = (share: number | null) => ({
    chronicLowFill: share != null && share < CHRONIC_LOW_FILL_THRESHOLD,
    glutMothball: share != null && share < GLUT_MOTHBALL_FILL_THRESHOLD,
    stranded: (share ?? 1) < STRANDED_LOW_FILL_THRESHOLD,
    streak: fundedLowSaleStreakStep(share),
  });

  it("reads 1 for a plant whose whole offer went to its own sites, and flags nothing", () => {
    const sector = {
      soldFraction: 0,
      producerSettlement: receipt({
        turn: 10,
        offeredUnits: 669,
        soldUnits: 0,
        products: [
          { commodity: "energy", internalDeliveredUnits: 600 },
          { commodity: "energy", internalDeliveredUnits: 69 },
        ],
      }),
    };
    expect(fundedTakenShare(sector, EPOCH, 10)).toBe(1);
    expect(nppSoldShare(sector, world)).toBe(1);
    expect(fundedSellThrough(sector, EPOCH, 10)).toBe(0);
    expect(flaggedBy(nppSoldShare(sector, world))).toEqual({
      chronicLowFill: false,
      glutMothball: false,
      stranded: false,
      streak: "reset",
    });
  });

  it("adds own-site deliveries to outside sales and clamps at 1", () => {
    const part = receipt({
      turn: 10,
      offeredUnits: 100,
      soldUnits: 20,
      products: [{ internalDeliveredUnits: 30 }],
    });
    expect(fundedTakenShare({ producerSettlement: part }, EPOCH, 10)).toBe(0.5);
    const over = receipt({
      turn: 10,
      offeredUnits: 100,
      soldUnits: 80,
      products: [{ internalDeliveredUnits: 40 }],
    });
    expect(fundedTakenShare({ producerSettlement: over }, EPOCH, 10)).toBe(1);
  });

  it("still reads 0 and flags every rule when nothing was sold or delivered and output went unsold", () => {
    const sector = {
      soldFraction: 1,
      producerSettlement: receipt({
        turn: 10,
        offeredUnits: 120,
        soldUnits: 0,
        products: [{ commodity: "energy", internalDeliveredUnits: 0 }],
      }),
    };
    expect(fundedTakenShare(sector, EPOCH, 10)).toBe(0);
    expect(nppSoldShare(sector, world)).toBe(0);
    expect(flaggedBy(nppSoldShare(sector, world))).toEqual({
      chronicLowFill: true,
      glutMothball: true,
      stranded: true,
      streak: "increment",
    });
  });
});
