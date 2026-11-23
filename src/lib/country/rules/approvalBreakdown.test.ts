import { describe, expect, it } from "vitest";
import { applyModifiers, type ActiveModifier } from "@/lib/utils/approvalModifiers";
import {
  buildApprovalBreakdown,
  displayEffect,
  listedRegionAverage,
  NATIONAL_CAP_ADJUSTMENT_ID,
} from "./approvalBreakdown";

const mod = (id: string, effect: number): ActiveModifier => ({ id, label: id, effect });

describe("buildApprovalBreakdown", () => {
  it("reconciles state average plus adjustments to the stored rating", () => {
    const national = [mod("public_expectations", -5), mod("cabinet_none", -7.5)];
    const rating = applyModifiers(53.7, national);
    expect(rating).toBe(41.2);
    const b = buildApprovalBreakdown(rating, national);
    expect(b.stateAverage).toBe(53.7);
    expect(b.nationalNet).toBe(-12.5);
    expect(b.nationalAdjustments.map((m) => m.effect)).toEqual([-5, -7.5]);
  });

  it("adds a cap line when positives exceed the cap", () => {
    const national = [mod("a", 6), mod("b", 6), mod("c", -2)];
    const rating = applyModifiers(50, national);
    const b = buildApprovalBreakdown(rating, national);
    expect(b.stateAverage).toBe(50);
    const sum = b.nationalAdjustments.reduce((s, m) => s + m.effect, 0);
    expect(Math.round((b.stateAverage + sum) * 10) / 10).toBe(rating);
    expect(b.nationalAdjustments.some((m) => m.id === NATIONAL_CAP_ADJUSTMENT_ID)).toBe(true);
  });

  it("drops adjustments that round to zero", () => {
    const b = buildApprovalBreakdown(50, [mod("bank_failure_backstop", -0.0000499)]);
    expect(b.nationalAdjustments).toEqual([]);
    expect(b.stateAverage).toBe(50);
  });

  it("handles no national modifiers", () => {
    expect(buildApprovalBreakdown(48.3, [])).toEqual({
      stateAverage: 48.3,
      nationalAdjustments: [],
      nationalNet: 0,
    });
  });
});

describe("displayEffect", () => {
  it("rounds tiny values away and keeps real ones", () => {
    expect(displayEffect(-0.0000499)).toBeNull();
    expect(displayEffect(-0.04)).toBeNull();
    expect(displayEffect(-0.26)).toBe(-0.3);
    expect(displayEffect(0)).toBe(0);
    expect(displayEffect(-7.5)).toBe(-7.5);
    expect(displayEffect(NaN)).toBeNull();
  });
});

describe("clamped approval breakdown", () => {
  it.each([
    [0, -80],
    [100, 80],
  ])("preserves the true regional average at approval %s", (approval, effect) => {
    const breakdown = buildApprovalBreakdown(approval, [mod("shock", effect)], 50);
    expect(breakdown.stateAverage).toBe(50);
    expect(breakdown.stateAverage + breakdown.nationalNet).toBe(approval);
    expect(breakdown.nationalAdjustments).toContainEqual(
      expect.objectContaining({ id: "approval_bounds" })
    );
  });
});

describe("listedRegionAverage", () => {
  it("weights the listed ratings by population and reports the gap to the stored average", () => {
    const result = listedRegionAverage(
      [
        { approval: 20, population: 1 },
        { approval: 40, population: 3 },
      ],
      36.6
    );
    expect(result).toEqual({ listedAverage: 35, gap: 1.6 });
  });

  it("skips regions without a population and returns null when nothing can be weighted", () => {
    expect(listedRegionAverage([{ approval: 10 }], 30)).toBeNull();
    expect(listedRegionAverage([], 30)).toBeNull();
  });
});

describe("national margin and region reconciliation", () => {
  const cond = (effect: number, marginEffect: number) => ({
    id: `c${effect}${marginEffect}`,
    label: "c",
    effect,
    marginEffect,
  });
  it("averages each region's own capped margin by population", async () => {
    const { nationalMarginFromRegions } = await import("./approvalBreakdown");
    expect(
      nationalMarginFromRegions([
        { population: 3, modifiers: [cond(-9, -9)] },
        { population: 1, modifiers: [cond(2, 2)] },
      ])
    ).toBe(-1.7);
    expect(nationalMarginFromRegions([])).toBeNull();
  });
  it("base plus effects plus adjustment lines equals the stated rating", async () => {
    const { reconcileRegionApproval } = await import("./approvalBreakdown");
    const mods = [
      { id: "regionalDebt", label: "d", effect: -25 },
      { id: "economic_boom", label: "b", effect: 2 },
      { id: "approval_smoothing", label: "s", effect: 9.1 },
    ];
    const r = reconcileRegionApproval(43.3, mods);
    expect(r).toEqual({ base: 43.3, effects: -23, adjustments: 9.1, total: 29.4 });
  });
});
