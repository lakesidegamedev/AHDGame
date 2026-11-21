import { describe, expect, it } from "vitest";
import type { CommodityType } from "@/lib/constants/commodities";
import { COMMODITY_BASE_PRICES } from "@/lib/constants/commodities";
import type { SectorStrategy } from "@/lib/constants/sectorStrategies";
import {
  computeRetoolHint,
  RETOOL_HINT_SUSTAIN_FILL,
  type RetoolHintInput,
  type RetoolHintSettlement,
} from "./retoolHint";

const strategy = (id: string, supply: Partial<Record<CommodityType, number>>): SectorStrategy => ({
  id,
  name: id[0].toUpperCase() + id.slice(1),
  description: "",
  supply,
  demand: {},
});

const SOFTWARE = strategy("software", { software: 0.55, electronics: 0.15 });
const HARDWARE = strategy("hardware", { electronics: 0.55, software: 0.15 });
const STANDARD = strategy("standard", { electronics: 0.35, software: 0.35 });

/** A US technology plant on the software strategy, ticket 1370's MA plant. */
function input(over: Partial<RetoolHintInput> = {}): RetoolHintInput {
  const books: Partial<Record<CommodityType, { supply: number; demand: number }>> = {
    // Software oversupplied 1.5x, electronics 31% short (live US t1266 shape).
    software: { supply: 3_800_000, demand: 2_500_000 },
    electronics: { supply: 14_500_000, demand: 21_000_000 },
  };
  const prices: Partial<Record<CommodityType, number>> = { software: 2.2, electronics: 7.2 };
  return {
    currentStrategyId: "software",
    currentSupply: SOFTWARE.supply,
    soldByCommodity: { software: 0.3, electronics: 1 },
    demandThrottleFactor: 0.1,
    mothballed: false,
    isTransitioning: false,
    producedUnits: 24_000,
    capacityUnits: 212_000,
    strategies: [STANDARD, HARDWARE, SOFTWARE],
    isAvailable: () => true,
    rescaleRatio: () => 1,
    priceRatioFor: (c) => prices[c],
    balanceFor: (c) => books[c],
    basePrices: COMMODITY_BASE_PRICES,
    ...over,
  };
}

describe("computeRetoolHint", () => {
  it("names the strategy that sells when the plant's valuable output is the glutted one", () => {
    const hint = computeRetoolHint(input());
    expect(hint).not.toBeNull();
    expect(hint!.currentMain.commodity).toBe("software");
    expect(hint!.currentMain.fill).toBeCloseTo(0.3, 6);
    expect(hint!.currentValueFill).toBeLessThan(RETOOL_HINT_SUSTAIN_FILL);
    expect(hint!.suggestedStrategyId).toBe("hardware");
    expect(hint!.suggestedMain.commodity).toBe("electronics");
    expect(hint!.suggestedMain.unmetShare).toBeCloseTo(1 - 14_500_000 / 21_000_000, 6);
    expect(hint!.suggestedValueFill).toBeGreaterThanOrEqual(RETOOL_HINT_SUSTAIN_FILL);
    expect(hint!.salesSource).toBe("clearing");
    expect(hint!.currentMain.marketSurplusShare).toBeCloseTo(1 - 2_500_000 / 3_800_000, 6);
    expect(hint!.runShare).toBeCloseTo(24_000 / 212_000, 6);
  });

  it("stays quiet for a plant that is not held back, or is already climbing", () => {
    expect(computeRetoolHint(input({ demandThrottleFactor: 1 }))).toBeNull();
    expect(computeRetoolHint(input({ demandThrottleFactor: null }))).toBeNull();
    // Sells nearly all of its output value: the throttle is already ramping it.
    expect(
      computeRetoolHint(input({ soldByCommodity: { software: 0.97, electronics: 1 } }))
    ).toBeNull();
  });

  it("stays quiet for a mothballed plant or one already retooling", () => {
    expect(computeRetoolHint(input({ mothballed: true }))).toBeNull();
    expect(computeRetoolHint(input({ isTransitioning: true }))).toBeNull();
  });

  it("does not suggest a locked strategy", () => {
    // Hardware locked: Standard is half software by rate but three quarters
    // electronics by value at these prices, so it is the next best and clears.
    const hint = computeRetoolHint(input({ isAvailable: (s) => s.id !== "hardware" }));
    expect(hint?.suggestedStrategyId).toBe("standard");
    expect(computeRetoolHint(input({ isAvailable: () => false }))).toBeNull();
  });

  it("does not suggest a mix the plant's own output would flood", () => {
    // A plant big enough to wipe out the electronics shortage on its own.
    const hint = computeRetoolHint(input({ capacityUnits: 40_000_000, producedUnits: 4_000_000 }));
    expect(hint).toBeNull();
  });

  it("stays quiet when every market this sector can serve is oversupplied", () => {
    const hint = computeRetoolHint(
      input({
        balanceFor: (c) =>
          c === "software"
            ? { supply: 3_800_000, demand: 2_500_000 }
            : { supply: 30_000_000, demand: 21_000_000 },
      })
    );
    expect(hint).toBeNull();
  });

  it("never suggests a strategy whose main product is the one that is not selling", () => {
    const healthcare = strategy("standard", { healthcare_services: 0.6, pharmaceuticals: 0.1 });
    const outpatient = strategy("outpatient", { healthcare_services: 0.5, pharmaceuticals: 0.2 });
    const hint = computeRetoolHint(
      input({
        currentStrategyId: "standard",
        currentSupply: healthcare.supply,
        strategies: [healthcare, outpatient],
        soldByCommodity: { healthcare_services: 0.55, pharmaceuticals: 1 },
        demandThrottleFactor: 0.95,
        priceRatioFor: () => 1,
        balanceFor: (c) =>
          c === "healthcare_services"
            ? { supply: 8_000_000, demand: 10_000_000 }
            : { supply: 1_000_000, demand: 10_000_000 },
        producedUnits: 600,
        capacityUnits: 620,
      })
    );
    expect(hint).toBeNull();
  });
});

// A single-product healthcare plant, turn 108 of a funded world.
// The settlement is what the plant was paid on; the clearing fill is a separate
// legacy reading of the same turn.
const T108_SETTLEMENT: RetoolHintSettlement = {
  turn: 108,
  capacityUnits: 25.943627450980383,
  producedUnits: 19.10778105537363,
  products: [
    {
      commodity: "healthcare_services",
      offeredUnits: 19.10778105537363,
      soldUnits: 18.10826783807554,
      internalDeliveredUnits: 0,
      askingUnitPrice: 10430.6875,
    },
  ],
};

const HOSPITAL = strategy("standard", { healthcare_services: 0.7 });
const OUTPATIENT = strategy("outpatient", { healthcare_services: 0.6, pharmaceuticals: 0.1 });
const DISPENSARY = strategy("dispensary", { pharmaceuticals: 0.6, healthcare_services: 0.1 });

function healthcare(over: Partial<RetoolHintInput> = {}): RetoolHintInput {
  return {
    currentStrategyId: "standard",
    currentSupply: HOSPITAL.supply,
    soldByCommodity: { healthcare_services: 0.554 },
    soldByCommodityTurn: 108,
    settlement: T108_SETTLEMENT,
    demandThrottleFactor: 0.9476907750616602,
    mothballed: false,
    isTransitioning: false,
    producedUnits: 458.59,
    capacityUnits: 622.6470588235292,
    strategies: [HOSPITAL, OUTPATIENT, DISPENSARY],
    isAvailable: () => true,
    rescaleRatio: () => 1,
    priceRatioFor: () => 1,
    // Healthcare 20% short, as the market book read on the plant page.
    balanceFor: (c) =>
      c === "healthcare_services"
        ? { supply: 8_000, demand: 10_000 }
        : { supply: 2_000, demand: 10_000 },
    basePrices: COMMODITY_BASE_PRICES,
    ...over,
  };
}

const GLUTTED = (c: CommodityType) =>
  c === "healthcare_services"
    ? { supply: 12_000, demand: 10_000 }
    : { supply: 2_000, demand: 10_000 };

describe("computeRetoolHint on a funded producer market", () => {
  it("reads the settlement, not the clearing fill, for a plant that sold 95% of its offer", () => {
    expect(computeRetoolHint(healthcare())).toBeNull();
    // Even in a glutted book the plant sold 95% of what it offered, so it is
    // climbing on its own and gets no advice. The 55% clearing fill would have
    // produced one.
    expect(computeRetoolHint(healthcare({ balanceFor: GLUTTED }))).toBeNull();
    const fromFill = computeRetoolHint(healthcare({ balanceFor: GLUTTED, settlement: null }));
    expect(fromFill?.currentMain.fill).toBeCloseTo(0.554, 6);
  });

  it("never calls a main product oversupplied when its own market book is short", () => {
    const halfSold: RetoolHintSettlement = {
      ...T108_SETTLEMENT,
      products: [{ commodity: "healthcare_services", offeredUnits: 20, soldUnits: 10 }],
    };
    expect(computeRetoolHint(healthcare({ settlement: halfSold }))).toBeNull();
    expect(computeRetoolHint(healthcare({ settlement: null }))).toBeNull();
    expect(
      computeRetoolHint(healthcare({ settlement: halfSold, balanceFor: () => null }))
    ).toBeNull();
  });

  it("still speaks up for a plant selling half of what it offered into a glut", () => {
    const halfSold: RetoolHintSettlement = {
      turn: 108,
      capacityUnits: 25,
      producedUnits: 15,
      products: [
        {
          commodity: "healthcare_services",
          offeredUnits: 20,
          soldUnits: 10,
          askingUnitPrice: 2500,
        },
      ],
    };
    const hint = computeRetoolHint(
      healthcare({ settlement: halfSold, balanceFor: GLUTTED, demandThrottleFactor: 0.5 })
    );
    expect(hint).not.toBeNull();
    expect(hint!.salesSource).toBe("settlement");
    expect(hint!.currentMain).toEqual({
      commodity: "healthcare_services",
      valueShare: 1,
      fill: 0.5,
      marketSurplusShare: 2_000 / 12_000,
    });
    expect(hint!.currentValueFill).toBeCloseTo(0.5, 6);
    expect(hint!.runShare).toBeCloseTo(15 / 25, 6);
    expect(hint!.suggestedStrategyId).toBe("dispensary");
  });

  it("counts own-site deliveries as taken", () => {
    const ownSites: RetoolHintSettlement = {
      ...T108_SETTLEMENT,
      products: [
        {
          commodity: "healthcare_services",
          offeredUnits: 20,
          soldUnits: 4,
          internalDeliveredUnits: 15,
        },
      ],
    };
    expect(computeRetoolHint(healthcare({ settlement: ownSites, balanceFor: GLUTTED }))).toBeNull();
  });

  it("never mixes turns: the newer record wins and a tie goes to the settlement", () => {
    const halfSold: RetoolHintSettlement = {
      turn: 108,
      capacityUnits: 25,
      producedUnits: 15,
      products: [{ commodity: "healthcare_services", offeredUnits: 20, soldUnits: 10 }],
    };
    const glut = { balanceFor: GLUTTED, demandThrottleFactor: 0.5 };
    // Settlement from an older turn than the fill: the plant was not settled
    // since, so the fill is the latest record.
    const older = computeRetoolHint(
      healthcare({ ...glut, settlement: { ...halfSold, turn: 107 }, soldByCommodityTurn: 108 })
    );
    expect(older?.salesSource).toBe("clearing");
    expect(older?.currentMain.fill).toBeCloseTo(0.554, 6);
    expect(older?.runShare).toBeCloseTo(458.59 / 622.6470588235292, 6);
    const same = computeRetoolHint(healthcare({ ...glut, settlement: halfSold }));
    expect(same?.salesSource).toBe("settlement");
    expect(same?.currentMain.fill).toBeCloseTo(0.5, 6);
    // A fill with no recorded turn cannot be newer than a settlement.
    const untimed = computeRetoolHint(
      healthcare({ ...glut, settlement: halfSold, soldByCommodityTurn: undefined })
    );
    expect(untimed?.salesSource).toBe("settlement");
  });

  it("weighs a multi-product plant by what each product sold, product by product", () => {
    // Software is the more valuable line and sold 30% of its offer; electronics
    // sold out. Values are offered units at the plant's own ask.
    const settlement: RetoolHintSettlement = {
      turn: 50,
      capacityUnits: 400,
      producedUnits: 130,
      products: [
        { commodity: "software", offeredUnits: 100, soldUnits: 30, askingUnitPrice: 2.2 },
        { commodity: "electronics", offeredUnits: 20, soldUnits: 20, askingUnitPrice: 7.2 },
      ],
    };
    const hint = computeRetoolHint(input({ settlement, soldByCommodityTurn: 50 }));
    expect(hint?.salesSource).toBe("settlement");
    expect(hint?.currentMain.commodity).toBe("software");
    expect(hint?.currentMain.fill).toBeCloseTo(0.3, 6);
    expect(hint?.currentMain.valueShare).toBeCloseTo(220 / 364, 6);
    expect(hint?.currentValueFill).toBeCloseTo((220 * 0.3 + 144) / 364, 6);
    expect(hint?.suggestedStrategyId).toBe("hardware");

    // Where the valuable line is electronics, which sold out into a short
    // market, there is no oversupplied main product to speak of.
    const soldOutMain: RetoolHintSettlement = {
      ...settlement,
      products: [
        { commodity: "software", offeredUnits: 100, soldUnits: 30, askingUnitPrice: 0.5 },
        { commodity: "electronics", offeredUnits: 20, soldUnits: 20, askingUnitPrice: 7.2 },
      ],
    };
    expect(
      computeRetoolHint(input({ settlement: soldOutMain, soldByCommodityTurn: 50 }))
    ).toBeNull();
  });
});
