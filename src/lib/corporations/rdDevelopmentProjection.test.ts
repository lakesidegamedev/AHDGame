import { describe, expect, it } from "vitest";
import { calcRdGrowth, RD_DECAY_RATE, TURNS_PER_DAY } from "@/lib/constants/corporations";
import {
  allocateProductDevelopmentBudget,
  PRODUCT_DEVELOPMENT_MAX_RD_SHARE,
} from "@/lib/products/rules/productBudgets";
import {
  calculateCorpStrengthProjection,
  genericResearchDailyAnchor,
  productDevelopmentDailyAnchor,
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

  it("still earns points on the half development leaves when a project is far from done", () => {
    const projection = calculateCorpStrengthProjection(
      { ...base, rdDevelopmentProjects: [project(17_895, 67_301)] },
      1
    );
    const researchDaily = 240_000 * (1 - PRODUCT_DEVELOPMENT_MAX_RD_SHARE);
    expect(projection.rdScoreGrowth).toBeCloseTo(calcRdGrowth(researchDaily, 1), 10);
    expect(projection.rdScoreGrowth).toBeGreaterThan(0);
    expect(projection.rdScoreNetChange).toBeCloseTo(
      calcRdGrowth(researchDaily, 1) - RD_DECAY_RATE,
      10
    );
  });

  it("matches the turn allocator, per turn, for research and development", () => {
    const cases = [
      { daily: 240_000, projects: [project(17_895, 67_301)] },
      { daily: 240_000, projects: [project(0, 4_000)] },
      { daily: 48_000, projects: [project(0, 9_000), { ...project(0, 3_000), id: "p2" }] },
      { daily: 0, projects: [project(0, 1_000)] },
      { daily: 96_000, projects: [] },
    ];
    for (const { daily, projects } of cases) {
      const turn = allocateProductDevelopmentBudget({
        budgetAnchor: daily / TURNS_PER_DAY,
        projects,
      });
      const turnDevelopment = Object.values(turn.byProjectId).reduce((a, b) => a + b, 0);
      expect(genericResearchDailyAnchor(daily, projects)).toBeCloseTo(
        turn.genericResearchAnchor * TURNS_PER_DAY,
        6
      );
      expect(productDevelopmentDailyAnchor(daily, projects)).toBeCloseTo(
        turnDevelopment * TURNS_PER_DAY,
        6
      );
      const projection = calculateCorpStrengthProjection(
        { ...base, rdBudget: daily, rdDevelopmentProjects: projects },
        1
      );
      expect(projection.rdScoreGrowth).toBeCloseTo(
        calcRdGrowth(turn.genericResearchAnchor * TURNS_PER_DAY, 1),
        10
      );
    }
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
