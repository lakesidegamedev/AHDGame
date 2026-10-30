import { describe, expect, it } from "vitest";
import { calcRdGrowth, RD_DECAY_RATE } from "@/lib/constants/corporations";
import {
  calculateCorpStrengthProjection,
  genericResearchDailyAnchor,
  remainingDevelopmentAnchor,
} from "./strengthProjection";

const project = (paid: number, threshold: number, stage = "development") => ({
  id: "p1",
  stage,
  paidAnchor: paid,
  thresholdAnchor: threshold,
});

describe("R&D projection with a product in development", () => {
  const base = { rdBudget: 240_000, rdScore: 1, liquidCurrencyCode: null };

  it("shows no growth, only decay, while the project absorbs the whole budget", () => {
    const projection = calculateCorpStrengthProjection(
      { ...base, rdDevelopmentProjects: [project(17_895, 67_301)] },
      1
    );
    expect(projection.rdScoreGrowth).toBe(0);
    expect(projection.rdScoreNetChange).toBeCloseTo(-RD_DECAY_RATE, 10);
  });

  it("matches the old figure with no project", () => {
    const projection = calculateCorpStrengthProjection(base, 1);
    expect(projection.rdScoreGrowth).toBeCloseTo(calcRdGrowth(240_000, 1), 10);
  });

  it("only the budget above the remaining cost earns points", () => {
    // 240k a day is 10k a turn; 4k still owed leaves 6k a turn, 144k a day.
    expect(genericResearchDailyAnchor(240_000, [project(0, 4_000)])).toBeCloseTo(144_000, 6);
  });

  it("ignores projects past development and sums what is owed", () => {
    expect(genericResearchDailyAnchor(240_000, [project(0, 1_000_000, "launch")])).toBe(240_000);
    expect(remainingDevelopmentAnchor([project(10, 50), project(0, 5, "launch")])).toBe(40);
  });
});
