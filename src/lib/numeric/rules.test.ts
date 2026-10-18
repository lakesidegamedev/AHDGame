import { describe, expect, it } from "vitest";
import {
  clamp,
  clampWithUpperPriority,
  clampPercentStat,
  clampPercentStatOr,
  clamp01,
  round4,
} from "./rules";

describe("numeric utility contracts", () => {
  it.each([clamp, clampWithUpperPriority])(
    "preserves bounds, NaN and signed zero (%#)",
    (bound) => {
      expect(bound(-1, 0, 100)).toBe(0);
      expect(bound(101, 0, 100)).toBe(100);
      expect(bound(12.5, 0, 100)).toBe(12.5);
      expect(bound(NaN, 0, 100)).toBeNaN();
      expect(bound(1, NaN, 100)).toBeNaN();
      expect(bound(1, 0, NaN)).toBeNaN();
      expect(bound(-Infinity, 0, 100)).toBe(0);
      expect(bound(Infinity, 0, 100)).toBe(100);
      expect(bound(-0, -0, 1)).toBe(-0);
      expect(bound(-0, 0, 1)).toBe(0);
    }
  );

  it("keeps distinct priorities for reversed bounds", () => {
    expect(clamp(5, 10, 0)).toBe(10);
    expect(clampWithUpperPriority(5, 10, 0)).toBe(0);
  });

  it.each([
    [-Infinity, 0, 0],
    [-1, 0, 0],
    [-0, 0, 0],
    [0.125, 0.125, 0.125],
    [101, 100, 1],
    [Infinity, 100, 0],
    [NaN, NaN, 0],
  ])("preserves percent and unit interval contracts for %s", (value, percent, unit) => {
    expect(clampPercentStat(value)).toBe(percent);
    expect(clamp01(value)).toBe(unit);
  });

  it.each([NaN, Infinity, -Infinity])(
    "substitutes non-finite inputs before percent clamping: %s",
    (value) => {
      for (const fallback of [-Infinity, -1, -0, 12.5, 101, Infinity, NaN]) {
        expect(clampPercentStatOr(value, fallback)).toBe(clampPercentStat(fallback));
        expect(clampPercentStatOr(12.5, fallback)).toBe(12.5);
      }
    }
  );

  it.each([
    [0.12345, 0.1235],
    [-0.12345, -0.1234],
    [-0.00001, -0],
    [Infinity, Infinity],
    [-Infinity, -Infinity],
    [NaN, NaN],
    [Number.MAX_VALUE, Infinity],
  ])("rounds %s with the original scale and tie behavior", (value, expected) => {
    expect(round4(value)).toBe(expected);
  });
});
