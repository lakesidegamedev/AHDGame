import { describe, expect, it } from "vitest";
import {
  demandPlanRunShare,
  FLOOR_RECOVERY_BAND,
  FLOOR_RECOVERY_STEP,
  GLUT_TURNS_TO_FLOOR,
  glutTurnsThrough,
  liveLineReceipt,
  LOW_USE_RUN_FLOOR,
  nextRunShare,
  OUTPUT_CUT_STEP,
  OUTPUT_GROW_STEP,
  OUTPUT_RUN_FLOOR,
  pacedRunShare,
  planBaseRunShare,
  planRecoveryRunShare,
  PLAN_RECOVERY_STEP,
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

  it("a sold-out plan that lost only on its crew bill grows from its plan scale, not the output scale", () => {
    // Live case: it made its whole plan of 21.95 of 8406.25 active, so
    // produced / active (0.0026) floors to 0.01 and would restart near the
    // floor every turn. Materials are covered (4.56 revenue per unit against
    // 2.28 materials); the crew and site bill makes the run a loss.
    const live = receipt({
      activeUnits: 8406.25,
      producedUnits: 21.95,
      plannedUnits: 21.95,
      offeredUnits: 21.95,
      soldUnits: 21.95,
      revenue: 100,
      inputsConsumed: 50,
      labourPaid: 200,
      otherOperatingPaid: 50,
      plannedRunShare: 0.01187,
    });
    const next = demandPlanRunShare(live, LOW_USE_RUN_FLOOR);
    expect(next).toBeCloseTo(0.01187 * (1 + OUTPUT_GROW_STEP), 12);
    expect(next).toBeGreaterThan(0.01187);
  });

  it("a starved sold-out run that lost on its crew bill grows from half the plan it made", () => {
    // Planned 40 units, made 20 of them, sold out, but the crew bill made the
    // run a loss: the fallback is half the planned share, then the growth step.
    const half = starved({ plannedUnits: 40, labourPaid: 500 });
    expect(demandPlanRunShare(half)).toBeCloseTo(0.5 * 0.5 * (1 + OUTPUT_GROW_STEP), 12);
  });

  it("a receipt without planned units keeps the output-scale fallback", () => {
    expect(demandPlanRunShare(starved({ plannedUnits: undefined, labourPaid: 500 }))).toBeCloseTo(
      0.2 * (1 + OUTPUT_GROW_STEP),
      12
    );
  });

  it("idle upkeep on the unrun capacity does not stop a starved line holding its plan", () => {
    // Site 400 of which 350 is cold upkeep on idle capacity: running cost
    // without it is 100 + 100 + 50 = 250 under revenue 400.
    const billed = starved({ otherOperatingPaid: 400, idleOperatingCost: 350 });
    expect(demandPlanRunShare(billed)).toBeCloseTo(0.5 * (1 + OUTPUT_GROW_STEP), 12);
    // The same bill with no idle split reads as a loss and falls back to what it made.
    expect(demandPlanRunShare(starved({ otherOperatingPaid: 400 }))).toBeCloseTo(
      0.2 * (1 + OUTPUT_GROW_STEP),
      12
    );
  });

  it("idle upkeep does not lift the materials brake", () => {
    expect(demandPlanRunShare(starved({ revenue: 50, idleOperatingCost: 1000 }))).toBeCloseTo(
      0.2 * (1 - OUTPUT_CUT_STEP),
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

  it("a run cut by cash plans from its planned run and the sell-through of what it made", () => {
    // Planned half the plant, cash let it make 20 of 100 and it sold 18 of them.
    const cut = starved({
      offeredUnits: 20,
      soldUnits: 18,
      revenue: 360,
      runCutBy: ["cash"],
    });
    // 0.5 x 100 x 0.9 x 1.1 expected sales, less the 2 units held.
    expect(demandPlanRunShare(cut)).toBeCloseTo((0.5 * 100 * 0.9 * 1.1 - 2) / 100, 12);
    // The same receipt with no recorded cut reads the low output as weak demand.
    expect(demandPlanRunShare({ ...cut, runCutBy: undefined })).toBeCloseTo(
      (18 * 1.1 - 2) / 100,
      12
    );
  });

  it("a cut run never plans below what its sales alone would", () => {
    // It made more than it planned: the cut reason changes nothing.
    const over = starved({
      offeredUnits: 40,
      soldUnits: 30,
      producedUnits: 40,
      plannedRunShare: 0.2,
      runCutBy: ["inputs"],
    });
    expect(demandPlanRunShare(over)).toBe(demandPlanRunShare({ ...over, runCutBy: undefined }));
  });
});

describe("plan recovery (producerRunPlanStage, ticket 1765)", () => {
  // A sold-out mine whose cash cut its run to half of what it planned.
  const cut = receipt({
    plannedRunShare: 0.4,
    producedUnits: 20,
    offeredUnits: 20,
    soldUnits: 20,
    revenue: 400,
    inputsConsumed: 100,
    runCutBy: ["cash"],
  });

  it("never plans below what sold last turn, even at a loss (owner invariant)", () => {
    // Sold out at a price below its running cost: the loss brake fires, but the
    // plan may not fall under the 0.5 of capacity buyers actually took.
    const losing = receipt({
      plannedRunShare: 0.5,
      producedUnits: 50,
      offeredUnits: 50,
      soldUnits: 50,
      revenue: 100,
      inputsConsumed: 400,
    });
    expect(planRecoveryRunShare(losing, { demandPlan: true })).toBeGreaterThanOrEqual(0.5);
    // A partial seller with held stock still plans at least what it sold.
    const partial = receipt({
      plannedRunShare: 0.8,
      producedUnits: 80,
      offeredUnits: 160,
      soldUnits: 60,
      revenue: 600,
      inputsConsumed: 100,
    });
    expect(planRecoveryRunShare(partial, { demandPlan: true })).toBeGreaterThanOrEqual(0.6);
  });

  it("stage 2: stock beyond the cover lowers the never-below-sales floor", () => {
    // A gas plant that sold what it made and carried an equal pile on top.
    const piled = receipt({
      plannedRunShare: 1,
      producedUnits: 100,
      offeredUnits: 260,
      soldUnits: 100,
      revenue: 1000,
      inputsConsumed: 100,
    });
    const before = planRecoveryRunShare(piled, { demandPlan: true });
    const after = planRecoveryRunShare(piled, { demandPlan: true, stockCoverTurns: 1 });
    // Held 160 against a one-turn cover of 100: 60 excess, floor (100 - 60) / 100.
    expect(before).toBeGreaterThanOrEqual(1);
    expect(after).toBeLessThan(before);
    expect(after).toBeGreaterThanOrEqual(0.4);
    // No pile beyond the cover: the floor is unchanged.
    const lean = receipt({
      plannedRunShare: 0.5,
      producedUnits: 50,
      offeredUnits: 90,
      soldUnits: 50,
      revenue: 100,
      inputsConsumed: 400,
    });
    expect(
      planRecoveryRunShare(lean, { demandPlan: true, stockCoverTurns: 1 })
    ).toBeGreaterThanOrEqual(0.5);
  });

  it("stage 3: a sold-out line selling below its running cost steps down below its sales", () => {
    // Sold all 50 it made at 2 a unit; inputs 1, wages 2 and site 1 a unit.
    const losing = receipt({
      plannedRunShare: 0.5,
      producedUnits: 50,
      offeredUnits: 50,
      soldUnits: 50,
      revenue: 100,
      inputsConsumed: 50,
      labourPaid: 100,
      otherOperatingPaid: 50,
    });
    const held = planRecoveryRunShare(losing, { demandPlan: true });
    const cut = planRecoveryRunShare(losing, { demandPlan: true, lossCutBelowSales: true });
    expect(held).toBeGreaterThanOrEqual(0.5);
    expect(cut).toBeCloseTo(0.5 * (1 - OUTPUT_CUT_STEP), 10);
    // A sold-out line that pays its running costs keeps growing.
    const paying = receipt({ ...losing, revenue: 400 });
    expect(
      planRecoveryRunShare(paying, { demandPlan: true, lossCutBelowSales: true })
    ).toBeGreaterThan(0.5);
  });

  it("an input or cash cut does not lower the next plan", () => {
    for (const runCutBy of [["cash"], ["inputs"]]) {
      const next = planRecoveryRunShare({ ...cut, runCutBy }, { demandPlan: true });
      expect(next).toBeGreaterThanOrEqual(0.4);
      expect(next).toBeCloseTo(0.4 + PLAN_RECOVERY_STEP, 10);
    }
    // The flag-off rules restart from the cut output instead.
    expect(nextRunShare(cut)).toBeCloseTo(0.2 * (1 + OUTPUT_GROW_STEP), 10);
  });

  it("a plant short of an input every turn keeps its plan instead of ratcheting down", () => {
    let plan = 0.6;
    for (let turn = 0; turn < 10; turn++) {
      const prior = receipt({
        plannedRunShare: plan,
        producedUnits: plan * 100 * 0.5,
        offeredUnits: plan * 100 * 0.5,
        soldUnits: plan * 100 * 0.5,
        revenue: plan * 100 * 0.5 * 10,
        inputsConsumed: plan * 100 * 0.5 * 2,
        runCutBy: ["inputs"],
      });
      const next = planRecoveryRunShare(prior, { demandPlan: true });
      expect(next).toBeGreaterThanOrEqual(plan);
      plan = next;
    }
    expect(plan).toBe(1);
  });

  it("a loss cut steps down from the plan, not from the cut output", () => {
    const losing = { ...cut, revenue: 20, inputsConsumed: 100 };
    expect(planRecoveryRunShare(losing)).toBeCloseTo(0.4 * (1 - OUTPUT_CUT_STEP), 10);
  });

  it("one glut turn steps down; only a second glut turn in a row drops to the floor", () => {
    const glut = receipt({
      plannedRunShare: 0.8,
      producedUnits: 80,
      offeredUnits: 80,
      soldUnits: 1,
    });
    expect(glutTurnsThrough(glut)).toBe(1);
    expect(planRecoveryRunShare(glut)).toBeCloseTo(0.8 * (1 - OUTPUT_CUT_STEP), 10);
    const second = { ...glut, priorGlutTurns: GLUT_TURNS_TO_FLOOR - 1 };
    expect(glutTurnsThrough(second)).toBe(GLUT_TURNS_TO_FLOOR);
    expect(planRecoveryRunShare(second, { floor: LOW_USE_RUN_FLOOR })).toBe(LOW_USE_RUN_FLOOR);
    // A turn that sold resets the streak.
    expect(glutTurnsThrough({ ...second, soldUnits: 80 })).toBe(0);
    // The flag-off rule floors on the first glut turn.
    expect(nextRunShare(glut)).toBe(OUTPUT_RUN_FLOOR);
  });

  it("recovers from the floor to a full run in about seven turns", () => {
    let plan = LOW_USE_RUN_FLOOR;
    let turns = 0;
    while (plan < 1 && turns < 50) {
      const units = plan * 100;
      plan = planRecoveryRunShare(
        receipt({
          plannedRunShare: plan,
          producedUnits: units,
          offeredUnits: units,
          soldUnits: units,
          revenue: units * 10,
          inputsConsumed: units * 2,
        }),
        { floor: LOW_USE_RUN_FLOOR, demandPlan: true }
      );
      turns++;
    }
    expect(turns).toBe(7);
  });

  it("shortage growth still grows faster than the step", () => {
    const soldOut = receipt({ plannedRunShare: 0.5, producedUnits: 50 });
    expect(planRecoveryRunShare(soldOut, { soldOutGrowth: 1.6 })).toBeCloseTo(0.8, 10);
  });

  it("falls back to the produced share when the receipt has no plan", () => {
    expect(planBaseRunShare(receipt())).toBe(0.5);
    expect(planRecoveryRunShare(receipt())).toBeCloseTo(0.5 + PLAN_RECOVERY_STEP, 10);
  });

  it("paces a fall from the plan when asked", () => {
    expect(pacedRunShare(0.1, cut, 0.25, OUTPUT_RUN_FLOOR, true)).toBeCloseTo(0.3, 10);
    expect(pacedRunShare(0.1, cut, 0.25)).toBeCloseTo(0.15, 10);
  });

  it("partial sell-through still plans from expected sales on the demand plan", () => {
    const partial = receipt({ plannedRunShare: 0.5, producedUnits: 50, soldUnits: 25 });
    expect(
      planRecoveryRunShare(partial, { demandPlan: true, floor: LOW_USE_RUN_FLOOR })
    ).toBeCloseTo(
      // Expected sales less held stock would be (25 * 1.1 - 25) / 100, but the
      // owner invariant keeps the plan at what sold: 25 of 100.
      Math.max((25 * 1.1 - 25) / 100, 0.25),
      10
    );
  });
});

describe("floor recovery in a slightly oversupplied market", () => {
  const floorPlant = (over: Partial<PriorReceipt> = {}) =>
    receipt({
      activeUnits: 100,
      producedUnits: 1,
      offeredUnits: 1,
      soldUnits: 0.92,
      revenue: 9.2,
      inputsConsumed: 2,
      plannedRunShare: LOW_USE_RUN_FLOOR,
      ...over,
    });
  const demand = (r: PriorReceipt) => demandPlanRunShare(r, LOW_USE_RUN_FLOOR);
  const recovery = (r: PriorReceipt) =>
    planRecoveryRunShare(r, { floor: LOW_USE_RUN_FLOOR, demandPlan: true });

  it("a floor plant at 92% sell-through steps up a small share, not to full", () => {
    for (const run of [demand, recovery]) {
      expect(run(floorPlant())).toBeCloseTo(LOW_USE_RUN_FLOOR + FLOOR_RECOVERY_STEP, 12);
    }
  });

  it("never steps past the band", () => {
    const r = floorPlant({
      producedUnits: 4.9,
      offeredUnits: 4.9,
      soldUnits: 4.5,
      plannedRunShare: 0.049,
    });
    expect(demand(r)).toBeLessThanOrEqual(FLOOR_RECOVERY_BAND);
  });

  it("a plant above the band is untouched", () => {
    const r = floorPlant({
      producedUnits: 20,
      offeredUnits: 20,
      soldUnits: 18.4,
      plannedRunShare: 0.2,
    });
    expect(demand(r)).toBeLessThan(0.2);
  });

  it("low sell-through gets no step", () => {
    expect(demand(floorPlant({ soldUnits: 0.6 }))).toBe(LOW_USE_RUN_FLOOR);
  });

  it("losing money per unit gets no step", () => {
    expect(demand(floorPlant({ revenue: 0.5, inputsConsumed: 5 }))).toBe(LOW_USE_RUN_FLOOR);
  });

  it("stock piling up gets no step", () => {
    expect(
      demand(
        floorPlant({
          activeUnits: 1000,
          offeredUnits: 6,
          producedUnits: 0.2,
          soldUnits: 5.4,
          revenue: 54,
        })
      )
    ).toBe(LOW_USE_RUN_FLOOR);
  });
});
