import { describe, expect, it } from "vitest";
import { clampFundedPrice, softCeiling } from "./fundedPriceClamp";

const PACE = { maxMove: 0.02, maxMultiplier: 3 };

describe("clampFundedPrice", () => {
  it("limits a rise to the configured move from last turn", () => {
    expect(clampFundedPrice(150, 100, 100, PACE)).toBe(102);
  });

  it("limits a fall the same way", () => {
    expect(clampFundedPrice(50, 100, 100, PACE)).toBe(98);
  });

  it("leaves a price inside the band alone", () => {
    expect(clampFundedPrice(101, 100, 100, PACE)).toBe(101);
  });

  it("never publishes above the multiplier ceiling", () => {
    expect(clampFundedPrice(400, 299, 100, PACE)).toBe(300);
  });

  it("applies only the ceiling when there is no prior price", () => {
    expect(clampFundedPrice(900, undefined, 100, PACE)).toBe(300);
  });
});

describe("soft price ceiling (issue #5448)", () => {
  it("leaves prices below the knee untouched", () => {
    expect(softCeiling(150, 300)).toBe(150);
    expect(softCeiling(180, 300)).toBe(180);
  });

  it("keeps deeper shortages higher but never reaches the ceiling", () => {
    const a = softCeiling(250, 300);
    const b = softCeiling(400, 300);
    const c = softCeiling(1_000, 300);
    expect(a).toBeLessThan(b);
    expect(b).toBeLessThan(c);
    expect(c).toBeLessThan(300);
  });

  it("stops two different shortages from publishing the same pinned price", () => {
    const pace = { maxMove: 1, maxMultiplier: 3, softCeiling: true };
    const short = clampFundedPrice(320, 290, 100, pace);
    const shorter = clampFundedPrice(600, 290, 100, pace);
    expect(short).toBeLessThan(300);
    expect(shorter).toBeLessThan(300);
    expect(shorter).toBeGreaterThan(short);
    // Hard ceiling: both pin to exactly 300.
    expect(clampFundedPrice(320, 290, 100, { ...pace, softCeiling: false })).toBe(300);
    expect(clampFundedPrice(600, 290, 100, { ...pace, softCeiling: false })).toBe(300);
  });
});

describe("soft ceiling order: soften the target, then pace (review of #5464)", () => {
  const pace = { maxMove: 0.02, maxMultiplier: 3, softCeiling: true };

  it("moves one realistic paced step toward the soft target, not below the floor of the step", () => {
    // Target 600 on a 300 ceiling softens to about 296.4; one 2% step from 300 allows 294 to 306.
    const next = clampFundedPrice(600, 300, 100, pace);
    expect(next).toBeCloseTo(softCeiling(600, 300), 1);
    expect(next).toBeGreaterThanOrEqual(294);
  });

  it("holds at the soft target over 60 turns with demand unchanged", () => {
    let price = 300;
    for (let turn = 0; turn < 60; turn++) price = clampFundedPrice(600, price, 100, pace);
    expect(price).toBeCloseTo(softCeiling(600, 300), 1);
  });
});
