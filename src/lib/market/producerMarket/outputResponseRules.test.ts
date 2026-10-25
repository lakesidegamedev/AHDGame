import { describe, expect, it } from "vitest";
import {
  demandPlanRunShare,
  LOW_USE_RUN_FLOOR,
  nextRunShare,
  OUTPUT_CUT_STEP,
  OUTPUT_GROW_STEP,
  OUTPUT_RUN_FLOOR,
  pacedRunShare,
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

  it("sold out, covered its materials but not its crew and site bill: runs a step more to spread them", () => {
    expect(
      nextRunShare(receipt({ labourPaid: 200, labourArrears: 50, otherOperatingPaid: 100 }))
    ).toBeCloseTo(0.5 * (1 + OUTPUT_GROW_STEP), 12);
  });

  it("sold only part and lost money on wages and site costs: runs a step less", () => {
    expect(
      nextRunShare(
        receipt({ soldUnits: 40, revenue: 400, labourPaid: 200, otherOperatingPaid: 100 })
      )
    ).toBeLessThan(0.5);
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

  it("a sold-out line that sells below its running cost cuts instead of growing", () => {
    const share = demandPlanRunShare(
      receipt({ soldUnits: 50, offeredUnits: 50, revenue: 100, inputsConsumed: 200 })
    );
    expect(share).toBeCloseTo(0.5 * (1 - OUTPUT_CUT_STEP), 12);
  });

  it("a sold-out line that covers its materials grows even while its crew bill makes it lose", () => {
    const share = demandPlanRunShare(
      receipt({
        activeUnits: 1000,
        producedUnits: 20,
        offeredUnits: 20,
        soldUnits: 20,
        revenue: 200,
        inputsConsumed: 40,
        labourPaid: 2000,
      }),
      LOW_USE_RUN_FLOOR
    );
    expect(share).toBeCloseTo(0.02 * (1 + OUTPUT_GROW_STEP), 12);
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

describe("paced run share", () => {
  it("limits how much of last turn's run a plant sheds, never growth", () => {
    // Last turn ran 50 of 100 units.
    expect(pacedRunShare(0.01, receipt(), 0.15)).toBeCloseTo(0.5 * 0.85, 12);
    expect(pacedRunShare(0.45, receipt(), 0.15)).toBeCloseTo(0.45, 12);
    expect(pacedRunShare(0.9, receipt(), 0.15)).toBeCloseTo(0.9, 12);
  });

  it("is a no-op when off, with no history, or without capacity", () => {
    expect(pacedRunShare(0.01, receipt(), 0)).toBe(0.01);
    expect(pacedRunShare(0.01, null, 0.15)).toBe(0.01);
    expect(pacedRunShare(0.01, receipt({ activeUnits: 0 }), 0.15)).toBe(0.01);
  });
});
