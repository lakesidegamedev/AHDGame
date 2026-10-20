import { describe, expect, it } from "vitest";
import { NATIONAL_PRICE_ADJUSTMENT_RATE } from "@/lib/constants/commodities";
import { adjustNationalPrice } from "./pricing";

describe("adjustNationalPrice", () => {
  it("damps a two-turn cobweb that the raw target keeps alternating", () => {
    // Price-responsive target through the observed exporter swing: a cheap
    // national price ships exports (supply falls, target at the effective
    // base 294.28); a dear one ships nothing (glut, target 188.44).
    const [low, high, start] = [188.44, 294.28, 199.67];
    const slope = (low - high) / (high - start);
    const target = (p: number) => Math.min(high, Math.max(low, high + slope * (p - start)));

    let raw = start;
    let damped = start;
    const rawSwings: number[] = [];
    const dampedSwings: number[] = [];
    for (let turn = 0; turn < 12; turn++) {
      const nextRaw = target(raw);
      const nextDamped = adjustNationalPrice(damped, target(damped));
      rawSwings.push(Math.abs(nextRaw - raw));
      dampedSwings.push(Math.abs(nextDamped - damped));
      raw = nextRaw;
      damped = nextDamped;
    }
    expect(Math.min(...rawSwings.slice(-4))).toBeGreaterThan(100);
    for (let i = 1; i < dampedSwings.length; i++) {
      expect(dampedSwings[i]).toBeLessThanOrEqual(dampedSwings[i - 1]);
    }
    expect(dampedSwings.at(-1)).toBeLessThan(0.05);
    expect(Math.abs(target(damped) - damped)).toBeLessThan(0.1);
  });

  it("moves one step of the adjustment rate toward the target", () => {
    expect(adjustNationalPrice(200, 300)).toBeCloseTo(
      200 + NATIONAL_PRICE_ADJUSTMENT_RATE * 100,
      2
    );
  });

  it("uses the target unchanged when there is no previous price", () => {
    expect(adjustNationalPrice(undefined, 294.28)).toBe(294.28);
  });

  it.each([0, -5, Number.NaN, Number.POSITIVE_INFINITY])(
    "uses the target unchanged when the previous price is %s",
    (previous) => {
      expect(adjustNationalPrice(previous, 294.28)).toBe(294.28);
    }
  );

  it("keeps the previous price when the target is not finite", () => {
    expect(adjustNationalPrice(250, Number.NaN)).toBe(250);
  });

  it("stays at a steady target", () => {
    expect(adjustNationalPrice(258.91, 258.91)).toBe(258.91);
  });
});
