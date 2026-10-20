import { describe, expect, it } from "vitest";
import {
  nextRunShare,
  OUTPUT_CUT_STEP,
  OUTPUT_GROW_STEP,
  OUTPUT_RUN_FLOOR,
} from "./outputResponseRules";

const receipt = (over: Partial<Parameters<typeof nextRunShare>[0] & object> = {}) => ({
  activeUnits: 100,
  producedUnits: 50,
  offeredUnits: 50,
  soldUnits: 50,
  revenue: 500,
  inputsConsumed: 200,
  ...over,
});

describe("output follows price", () => {
  it("a plant with no history runs fully", () => {
    expect(nextRunShare(null)).toBe(1);
  });

  it("sold out at a profit: runs a step more", () => {
    expect(nextRunShare(receipt())).toBeCloseTo(0.5 * (1 + OUTPUT_GROW_STEP), 12);
  });

  it("each unit lost money on inputs: runs a step less", () => {
    expect(nextRunShare(receipt({ revenue: 100, inputsConsumed: 200 }))).toBeCloseTo(
      0.5 * (1 - OUTPUT_CUT_STEP),
      12
    );
  });

  it("each unit covered its inputs but not its wages and site costs: runs a step less", () => {
    expect(
      nextRunShare(receipt({ labourPaid: 200, labourArrears: 50, otherOperatingPaid: 100 }))
    ).toBeCloseTo(0.5 * (1 - OUTPUT_CUT_STEP), 12);
  });

  it("sold only part: moves toward what sold, never faster than a step", () => {
    const n = nextRunShare(receipt({ soldUnits: 10, revenue: 100, inputsConsumed: 40 }));
    expect(n).toBeCloseTo(0.5 * (1 - OUTPUT_CUT_STEP), 12);
  });

  it("never drops below the probe floor and never exceeds full", () => {
    expect(
      nextRunShare(receipt({ producedUnits: 5, offeredUnits: 5, soldUnits: 0, revenue: 0 }))
    ).toBe(OUTPUT_RUN_FLOOR);
    expect(nextRunShare(receipt({ producedUnits: 100, offeredUnits: 100, soldUnits: 100 }))).toBe(
      1
    );
  });

  it("a glut drops straight to the probe run and grows back a step once sales return", () => {
    expect(
      nextRunShare(receipt({ producedUnits: 100, offeredUnits: 400, soldUnits: 10, revenue: 50 }))
    ).toBe(OUTPUT_RUN_FLOOR);
    expect(
      nextRunShare(
        receipt({
          producedUnits: 10,
          offeredUnits: 10,
          soldUnits: 10,
          revenue: 100,
          inputsConsumed: 20,
        })
      )
    ).toBeCloseTo(0.1 * (1 + OUTPUT_GROW_STEP), 12);
  });

  it("labour is not in the test: a plant that covers its inputs keeps running", () => {
    // Revenue 300 > inputs 200, even though wages would make the plant lose money overall.
    expect(nextRunShare(receipt({ revenue: 300 }))).toBeGreaterThan(0.5);
  });
});
