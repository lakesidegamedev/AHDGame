import { describe, expect, it } from "vitest";
import {
  demandPlanRunShare,
  liveLineReceipt,
  LOW_USE_RUN_FLOOR,
  nextRunShare,
  OUTPUT_CUT_STEP,
  OUTPUT_GROW_STEP,
  OUTPUT_RUN_FLOOR,
  pacedRunShare,
  type PriorReceipt,
  type ReceiptLine,
} from "./outputResponseRules";

const receipt = (over: Partial<PriorReceipt & { products: ReceiptLine[] }> = {}) => ({
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

describe("run signals read the lines the plant makes", () => {
  // A retooled mine: iron sells out, leftover oil from the old recipe barely sells.
  const retooled = () =>
    receipt({
      activeUnits: 100,
      producedUnits: 1,
      offeredUnits: 3,
      soldUnits: 1.2,
      revenue: 104,
      inputsConsumed: 10,
      products: [
        { commodity: "iron", offeredUnits: 1, soldUnits: 1, revenue: 100 },
        { commodity: "oil", offeredUnits: 2, soldUnits: 0.2, revenue: 4 },
      ],
    });

  it("drops leftover lines from offered, sold and revenue", () => {
    const live = liveLineReceipt(retooled(), new Set(["iron"]));
    expect(live).toMatchObject({ offeredUnits: 1, soldUnits: 1, revenue: 100 });
    expect(live.products?.map((p) => p.commodity)).toEqual(["iron"]);
  });

  it("a sold-out current line grows despite unsold leftover stock", () => {
    const whole = demandPlanRunShare(retooled(), LOW_USE_RUN_FLOOR);
    const live = demandPlanRunShare(
      liveLineReceipt(retooled(), new Set(["iron"])),
      LOW_USE_RUN_FLOOR
    );
    // Whole plant: 40% sell-through, plan 1.32 - 1.8 held -> the probe floor.
    expect(whole).toBe(LOW_USE_RUN_FLOOR);
    expect(live).toBeCloseTo(0.01 * (1 + OUTPUT_GROW_STEP), 12);
    expect(
      nextRunShare(liveLineReceipt(retooled(), new Set(["iron"])), LOW_USE_RUN_FLOOR)
    ).toBeCloseTo(0.01 * (1 + OUTPUT_GROW_STEP), 12);
  });

  it("leaves a receipt alone when every line is current, none is, or rows are missing", () => {
    const r = retooled();
    expect(liveLineReceipt(r, new Set(["iron", "oil"]))).toBe(r);
    expect(liveLineReceipt(r, new Set(["steel"]))).toBe(r);
    const bare = receipt();
    expect(liveLineReceipt(bare, new Set(["iron"]))).toBe(bare);
  });
});

describe("a sold-out line short of inputs holds its plan", () => {
  // Planned a full run, inputs filled a fifth of it, everything made sold at a profit.
  const starved = (over: Parameters<typeof receipt>[0] = {}) =>
    receipt({
      activeUnits: 100,
      producedUnits: 20,
      offeredUnits: 20,
      soldUnits: 20,
      revenue: 400,
      inputsConsumed: 100,
      labourPaid: 100,
      plannedRunShare: 0.5,
      ...over,
    });

  it("grows from the planned run, not the cut output", () => {
    expect(demandPlanRunShare(starved())).toBeCloseTo(0.5 * (1 + OUTPUT_GROW_STEP), 12);
    expect(demandPlanRunShare(starved(), OUTPUT_RUN_FLOOR, 2)).toBe(1);
  });

  it("a cold start cut by inputs does not ratchet down turn after turn", () => {
    let run = 1;
    for (let turn = 0; turn < 5; turn++) {
      // Inputs fill a fifth of whatever is planned.
      run = demandPlanRunShare(
        starved({
          producedUnits: 100 * run * 0.2,
          offeredUnits: 100 * run * 0.2,
          soldUnits: 100 * run * 0.2,
          revenue: 2000 * run * 0.2,
          inputsConsumed: 500 * run * 0.2,
          labourPaid: 0,
          plannedRunShare: run,
        })
      );
      expect(run).toBe(1);
    }
  });

  it("uses what it made when that is above the plan", () => {
    expect(demandPlanRunShare(starved({ plannedRunShare: 0.1 }))).toBeCloseTo(
      0.2 * (1 + OUTPUT_GROW_STEP),
      12
    );
  });

  it("a starved run that did not cover its crew and site bill grows only from what it made", () => {
    // Revenue 400 covers materials (100) but not materials plus a 500 crew bill.
    expect(demandPlanRunShare(starved({ labourPaid: 500 }))).toBeCloseTo(
      0.2 * (1 + OUTPUT_GROW_STEP),
      12
    );
  });

  it("a line selling under its materials still cuts from what it made", () => {
    expect(demandPlanRunShare(starved({ revenue: 50 }))).toBeCloseTo(
      0.2 * (1 - OUTPUT_CUT_STEP),
      12
    );
  });

  it("ignores the plan when the line did not sell out", () => {
    const partial = starved({ offeredUnits: 40, soldUnits: 20 });
    const without = starved({ offeredUnits: 40, soldUnits: 20, plannedRunShare: undefined });
    expect(demandPlanRunShare(partial)).toBe(demandPlanRunShare(without));
  });
});
