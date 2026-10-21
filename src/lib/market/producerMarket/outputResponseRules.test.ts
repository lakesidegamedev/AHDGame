import { describe, expect, it } from "vitest";
import {
  demandPlanRunShare,
  LOW_USE_RUN_FLOOR,
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

describe("production follows demand", () => {
  it("a plant with no history runs fully", () => {
    expect(demandPlanRunShare(null)).toBe(1);
  });

  it("cuts straight to expected sales rather than a step a turn", () => {
    // Made 50 of 100 active, offered 50, sold 10: plans 11 units, not 45.
    const share = demandPlanRunShare(receipt({ soldUnits: 10, offeredUnits: 50 }));
    expect(share).toBeCloseTo(Math.max(OUTPUT_RUN_FLOOR, (10 * 1.1 - 40) / 100), 12);
    expect(share).toBe(OUTPUT_RUN_FLOOR);
  });

  it("makes only what sells beyond the stock it holds", () => {
    // Offered 80 (30 held over), sold 60: plans 66 - 20 = 46.
    const share = demandPlanRunShare(
      receipt({ producedUnits: 50, offeredUnits: 80, soldUnits: 60 })
    );
    expect(share).toBeCloseTo(0.46, 12);
  });

  it("grows a step when sold out", () => {
    expect(demandPlanRunShare(receipt())).toBeCloseTo(0.5 * (1 + OUTPUT_GROW_STEP), 12);
  });

  it("keeps a probe run when nothing sold", () => {
    expect(demandPlanRunShare(receipt({ soldUnits: 0, offeredUnits: 50 }))).toBe(OUTPUT_RUN_FLOOR);
  });
});

describe("low-use probe floor", () => {
  it("lets a plant that sells nothing drop to the small probe run", () => {
    const sold0 = receipt({ soldUnits: 0, offeredUnits: 50 });
    expect(nextRunShare(sold0)).toBe(OUTPUT_RUN_FLOOR);
    expect(nextRunShare(sold0, LOW_USE_RUN_FLOOR)).toBe(LOW_USE_RUN_FLOOR);
    expect(demandPlanRunShare(sold0)).toBe(OUTPUT_RUN_FLOOR);
    expect(demandPlanRunShare(sold0, LOW_USE_RUN_FLOOR)).toBe(LOW_USE_RUN_FLOOR);
  });
});
