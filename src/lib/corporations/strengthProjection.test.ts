import { describe, expect, it } from "vitest";
import { calcLogisticsGrowth, calcMarketingGrowth } from "@/lib/constants/corporations";
import {
  calculateCorpStrengthProjection,
  marketingStrengthEquilibrium,
} from "./strengthProjection";
import { MARKETING_DECAY_RATE } from "./strengthUpkeep";

describe("calculateCorpStrengthProjection", () => {
  it("normalizes local-currency budgets before projecting strength gains", () => {
    const projection = calculateCorpStrengthProjection(
      {
        liquidCurrencyCode: "JPY",
        marketingBudget: 2_400_000,
        marketingStrength: 2.5,
        logisticsBudget: 1_200_000,
        logisticsStrength: 10,
      },
      133.2808416448283
    );

    expect(projection.marketingStrengthGrowth).toBeCloseTo(
      calcMarketingGrowth(2_400_000 / 133.2808416448283, 2.5),
      8
    );
    expect(projection.marketingStrengthGrowth).not.toBeCloseTo(
      calcMarketingGrowth(2_400_000, 2.5),
      2
    );
    expect(projection.logisticsStrengthNetChange).toBeCloseTo(
      calcLogisticsGrowth(1_200_000 / 133.2808416448283) - 10 * 0.05,
      8
    );
  });

  it("subtracts marketing decay when upkeep stage 3 is active", () => {
    const projection = calculateCorpStrengthProjection(
      {
        marketingBudget: 100_000,
        marketingStrength: 100,
        strengthUpkeepStage: 3,
      },
      1
    );

    expect(projection.marketingStrengthGrowth).toBeCloseTo(
      calcMarketingGrowth(100_000, 100) - 100 * MARKETING_DECAY_RATE,
      8
    );
  });

  it("passes through pre-forex anchor budgets", () => {
    const projection = calculateCorpStrengthProjection(
      {
        marketingBudget: 100_000,
        marketingStrength: 10,
        logisticsBudget: 100_000,
        logisticsStrength: 0,
      },
      150
    );

    expect(projection.marketingStrengthGrowth).toBeCloseTo(calcMarketingGrowth(100_000, 10), 8);
    expect(projection.logisticsStrengthNetChange).toBeCloseTo(calcLogisticsGrowth(100_000), 8);
  });
});

describe("marketingStrengthEquilibrium", () => {
  it("finds the level where growth equals decay", () => {
    const budget = 20_400_000;
    const level = marketingStrengthEquilibrium(budget, MARKETING_DECAY_RATE);
    expect(level).not.toBeNull();
    const eq = level as number;
    expect(calcMarketingGrowth(budget, eq)).toBeCloseTo(eq * MARKETING_DECAY_RATE, 6);
  });

  it("reports a fall for a corporation above its resting level (ticket 1695)", () => {
    const budget = 20_400_000;
    const projection = calculateCorpStrengthProjection(
      { marketingBudget: budget, marketingStrength: 165, strengthUpkeepStage: 3 },
      1
    );
    expect(projection.marketingDecayRate).toBe(MARKETING_DECAY_RATE);
    expect(calcMarketingGrowth(budget, 165)).toBeGreaterThan(0);
    expect(projection.marketingStrengthGrowth).toBeLessThan(0);
    expect(marketingStrengthEquilibrium(budget, MARKETING_DECAY_RATE)).toBeLessThan(165);
  });

  it("has no resting level without decay or spend", () => {
    expect(marketingStrengthEquilibrium(20_400_000, 0)).toBeNull();
    expect(marketingStrengthEquilibrium(0, MARKETING_DECAY_RATE)).toBeNull();
  });
});
