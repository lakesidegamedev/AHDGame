import { describe, expect, it } from "vitest";
import {
  IDLE_RETIRE_GRACE_TURNS,
  IDLE_RETIRE_PROBE_SHARE,
  IDLE_RETIRE_RATE,
  idleRetireFraction,
} from "./idleRetirementRules";

const base = {
  mothballed: false,
  zeroSalesTurns: IDLE_RETIRE_GRACE_TURNS + 1,
  soldUnits: 0,
  activeUnits: 100,
};

describe("idle capacity retirement on the funded market", () => {
  it("retires nothing inside the grace period", () => {
    expect(idleRetireFraction({ ...base, zeroSalesTurns: IDLE_RETIRE_GRACE_TURNS })).toBe(0);
    expect(idleRetireFraction({ ...base, zeroSalesTurns: undefined })).toBe(0);
  });

  it("never retires a mothballed plant", () => {
    expect(idleRetireFraction({ ...base, mothballed: true })).toBe(0);
  });

  it("retires a share of everything above the probe run once persistently idle", () => {
    expect(idleRetireFraction(base)).toBeCloseTo(
      IDLE_RETIRE_RATE * (1 - IDLE_RETIRE_PROBE_SHARE),
      12
    );
  });

  it("keeps capacity its last sales justify", () => {
    // Sold 50 of 100: justified 60%, so only 40% of the rate applies.
    expect(idleRetireFraction({ ...base, soldUnits: 50 })).toBeCloseTo(IDLE_RETIRE_RATE * 0.4, 12);
  });

  it("is zero without active capacity", () => {
    expect(idleRetireFraction({ ...base, activeUnits: 0 })).toBe(0);
  });
});
