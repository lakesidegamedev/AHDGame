import { describe, expect, it } from "vitest";
import {
  LOSS_CARRYFORWARD_USE_CAP,
  applyLossCarryforward,
  openingCarryforward,
} from "./lossCarryforward";

describe("tax loss carryforward", () => {
  it("banks a loss and leaves tax untouched", () => {
    expect(applyLossCarryforward(-500, 100)).toEqual({ taxScale: 1, used: 0, closing: 600 });
  });
  it("offsets at most 80% of a profit", () => {
    const r = applyLossCarryforward(1000, 5000);
    expect(r.used).toBe(LOSS_CARRYFORWARD_USE_CAP * 1000);
    expect(r.taxScale).toBeCloseTo(0.2);
    expect(r.closing).toBe(4200);
  });
  it("uses a small bank fully", () => {
    const r = applyLossCarryforward(1000, 300);
    expect(r).toEqual({ taxScale: 0.7, used: 300, closing: 0 });
  });
  it("ignores bad inputs", () => {
    expect(applyLossCarryforward(Number.NaN, 100)).toEqual({ taxScale: 1, used: 0, closing: 100 });
    expect(applyLossCarryforward(100, -5).used).toBe(0);
  });
  it("restarts a retried turn from the bank before it", () => {
    const state = { anchor: 700, turn: 10, before: 400 };
    expect(openingCarryforward(state, 10)).toBe(400);
    expect(openingCarryforward(state, 11)).toBe(700);
    expect(openingCarryforward(undefined, 11)).toBe(0);
  });
});
