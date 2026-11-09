import { describe, expect, it } from "vitest";
import {
  allocateProductDevelopmentBudget,
  allocateProductAdvertisingBudget,
  PRODUCT_DEVELOPMENT_MAX_RD_SHARE,
} from "./productBudgets";

const sum = (values: Record<string, number>) =>
  Object.values(values).reduce((total, value) => total + value, 0);

describe("shared product budgets", () => {
  it("funds concurrent development without letting a launched manufacturing project block media", () => {
    const projects = [
      { id: "plant", stage: "launch", paidAnchor: 100, thresholdAnchor: 100 },
      { id: "title", stage: "development", paidAnchor: 20, thresholdAnchor: 100 },
    ];
    expect(allocateProductDevelopmentBudget({ budgetAnchor: 100, projects })).toEqual({
      byProjectId: { plant: 0, title: 50 },
      genericResearchAnchor: 50,
    });
    projects[0].stage = "development";
    projects[0].paidAnchor = 20;
    expect(allocateProductDevelopmentBudget({ budgetAnchor: 100, projects })).toEqual({
      byProjectId: { plant: 25, title: 25 },
      genericResearchAnchor: 50,
    });
  });

  describe("development never takes the whole R&D budget", () => {
    it("takes at most half by default", () => {
      expect(PRODUCT_DEVELOPMENT_MAX_RD_SHARE).toBe(0.5);
    });

    it("caps development at the share when the budget is below what is still owed", () => {
      const result = allocateProductDevelopmentBudget({
        budgetAnchor: 1_000,
        projects: [{ id: "old", stage: "development", paidAnchor: 0, thresholdAnchor: 50_000 }],
      });
      expect(result.byProjectId.old).toBe(500);
      expect(result.genericResearchAnchor).toBe(500);
    });

    it("pays only what is still owed when that is under the share", () => {
      const result = allocateProductDevelopmentBudget({
        budgetAnchor: 1_000,
        projects: [{ id: "old", stage: "development", paidAnchor: 900, thresholdAnchor: 1_000 }],
      });
      expect(result.byProjectId.old).toBe(100);
      expect(result.genericResearchAnchor).toBe(900);
    });

    it("gives research the whole budget with no projects", () => {
      expect(allocateProductDevelopmentBudget({ budgetAnchor: 1_000, projects: [] })).toEqual({
        byProjectId: {},
        genericResearchAnchor: 1_000,
      });
    });

    it("splits the capped share across several projects by what each still owes", () => {
      const result = allocateProductDevelopmentBudget({
        budgetAnchor: 1_000,
        projects: [
          { id: "a", stage: "development", paidAnchor: 0, thresholdAnchor: 3_000 },
          { id: "b", stage: "development", paidAnchor: 0, thresholdAnchor: 1_000 },
          { id: "done", stage: "launch", paidAnchor: 1_000, thresholdAnchor: 1_000 },
        ],
      });
      expect(result.byProjectId).toEqual({ a: 375, b: 125, done: 0 });
      expect(result.genericResearchAnchor).toBe(500);
    });

    it("conserves the budget: development plus research always equals it", () => {
      const cases = [
        { budget: 0, paid: 0, threshold: 100 },
        { budget: 7.3, paid: 1, threshold: 2 },
        { budget: 1_234_567, paid: 10, threshold: 1e12 },
        { budget: 1e9, paid: 5, threshold: 5 },
      ];
      for (const { budget, paid, threshold } of cases) {
        const result = allocateProductDevelopmentBudget({
          budgetAnchor: budget,
          projects: [
            { id: "x", stage: "development", paidAnchor: paid, thresholdAnchor: threshold },
            { id: "y", stage: "development", paidAnchor: 0, thresholdAnchor: threshold },
          ],
        });
        expect(sum(result.byProjectId) + result.genericResearchAnchor).toBeCloseTo(budget, 6);
        expect(result.genericResearchAnchor).toBeGreaterThanOrEqual(
          budget * (1 - PRODUCT_DEVELOPMENT_MAX_RD_SHARE) - 1e-6
        );
      }
    });

    it("treats a negative or non-finite budget as zero", () => {
      for (const budget of [-5, Number.NaN, Number.POSITIVE_INFINITY]) {
        const result = allocateProductDevelopmentBudget({
          budgetAnchor: budget,
          projects: [{ id: "x", stage: "development", paidAnchor: 0, thresholdAnchor: 10 }],
        });
        expect(result).toEqual({ byProjectId: { x: 0 }, genericResearchAnchor: 0 });
      }
    });
  });
  it("keeps delivered marketing conserved when both products claim the whole budget", () => {
    expect(
      allocateProductAdvertisingBudget({
        deliveredBudgetAnchor: 90,
        projects: [
          { id: "plant", share: 1 },
          { id: "title", share: 1 },
        ],
      })
    ).toEqual({ plant: 45, title: 45 });
    expect(
      allocateProductAdvertisingBudget({
        deliveredBudgetAnchor: 90,
        projects: [
          { id: "plant", share: 0.25 },
          { id: "title", share: 0.25 },
        ],
      })
    ).toEqual({ plant: 22.5, title: 22.5 });
    expect(
      allocateProductAdvertisingBudget({
        deliveredBudgetAnchor: 0,
        projects: [{ id: "plant", share: 1 }],
      })
    ).toEqual({ plant: 0 });
  });
});
