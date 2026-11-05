import { describe, expect, it } from "vitest";
import {
  alignIdleCauses,
  buildRunReport,
  turnsToFullRun,
  type RunReportStages,
} from "./sectorRunReport";
import type { CorporateSector } from "@/lib/db/types";

// Live stages on the world the report was written against (turn 673).
const LIVE: RunReportStages = {
  producerCaptiveDeliveryStage: 1,
  producerDemandPlanStage: 1,
  producerLowUseCostStage: 1,
  producerRunPaceDrop: 0.25,
};
const receipt = (over: Record<string, unknown> = {}) =>
  ({
    turn: 673,
    worldEpoch: "w",
    id: "p",
    capacityUnits: 437.5,
    activeUnits: 437.5,
    plannedRunShare: 0.01,
    plannedUnits: 4.27,
    producedUnits: 4.27,
    offeredUnits: 4.27,
    soldUnits: 0,
    revenue: 0,
    inputsConsumed: 308.68,
    labourPaid: 75.02,
    otherOperatingPaid: 31.4,
    idleOperatingCost: 10.5,
    products: [
      {
        commodity: "iron",
        book: "world",
        producedUnits: 4.27,
        offeredUnits: 4.27,
        soldUnits: 0,
        internalDeliveredUnits: 4.27,
        askingUnitPrice: 43.49,
      },
    ],
    ...over,
  }) as unknown as CorporateSector["producerSettlement"];

describe("run report", () => {
  it("calls an own-site iron mine whose materials cost more than its ask losing, not ramping (ticket 1765)", () => {
    const r = buildRunReport(receipt(), 673, LIVE)!;
    expect(r.reason).toBe("losing");
    expect(r.nextShare).toBeCloseTo(0.01);
    expect(r.unitPrice).toBeCloseTo(43.49);
    expect(r.unitMaterials).toBeCloseTo(72.29, 1);
    expect(r.ownSiteValued).toBe(true);
    expect(r.turnsToFull).toBeNull();
  });

  it("reads the same mine as no buyers when own-site deliveries are not counted as sales", () => {
    const r = buildRunReport(receipt(), 673, { ...LIVE, producerCaptiveDeliveryStage: 0 })!;
    expect(r.reason).toBe("no-buyers");
    expect(r.ownSiteValued).toBe(false);
  });

  it("says stepping up, with a turn count, for a sold-out run that paid", () => {
    const r = buildRunReport(
      receipt({
        plannedRunShare: 0.4,
        producedUnits: 175,
        offeredUnits: 175,
        soldUnits: 175,
        revenue: 175 * 200,
        inputsConsumed: 175 * 50,
        products: [],
      }),
      673,
      LIVE
    )!;
    expect(r.reason).toBe("stepping-up");
    expect(r.nextShare).toBeCloseTo(0.46);
    // 0.46 -> 1 at x1.15 a turn takes 6 more turns, plus next turn itself.
    expect(r.turnsToFull).toBe(7);
  });

  it("says kept low after a cut when a sold-out run that paid was cut by cash", () => {
    const r = buildRunReport(
      receipt({
        plannedRunShare: 0.8,
        producedUnits: 100,
        offeredUnits: 100,
        soldUnits: 100,
        revenue: 100 * 200,
        inputsConsumed: 100 * 50,
        runCutBy: ["cash"],
        products: [],
      }),
      673,
      LIVE
    )!;
    expect(r.reason).toBe("kept-low-after-cut");
    expect(r.cutBy).toEqual(["cash"]);
  });

  it("is absent for a stale receipt or no capacity", () => {
    expect(buildRunReport(receipt({ turn: 600 }), 673, LIVE)).toBeNull();
    expect(buildRunReport(receipt({ activeUnits: 0 }), 673, LIVE)).toBeNull();
    expect(buildRunReport(null, 673, LIVE)).toBeNull();
  });

  it("keeps its reason consistent with the direction of the plan across many receipts", () => {
    let seed = 7;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (let i = 0; i < 2000; i++) {
      const active = 100;
      const produced = rnd() * active;
      const offered = produced + rnd() * 20;
      const sold = rnd() < 0.5 ? offered : rnd() * offered;
      const r = buildRunReport(
        receipt({
          activeUnits: active,
          plannedRunShare: Math.max(produced / active, rnd()),
          producedUnits: produced,
          offeredUnits: offered,
          soldUnits: sold,
          revenue: sold * (20 + rnd() * 100),
          inputsConsumed: produced * rnd() * 80,
          labourPaid: produced * rnd() * 10,
          otherOperatingPaid: produced * rnd() * 5,
          products: [],
        }),
        673,
        LIVE
      )!;
      const made = Math.max(0.01, Math.min(1, produced / active));
      if (r.reason === "losing") expect(r.nextShare).toBeLessThanOrEqual(made + 1e-9);
      if (r.reason === "stepping-up") expect(r.nextShare).toBeGreaterThanOrEqual(made - 1e-9);
    }
  });
});

describe("idle causes aligned with the report", () => {
  it("moves ramping and demand to losing when the plan is cut for a loss", () => {
    const r = buildRunReport(receipt(), 673, LIVE);
    const causes = alignIdleCauses(
      [
        { cause: "ramping", units: 10_360 },
        { cause: "staffing", units: 35 },
      ],
      r
    );
    expect(causes).toEqual([
      { cause: "losing", units: 10_360 },
      { cause: "staffing", units: 35 },
    ]);
  });

  it("leaves causes alone without a report", () => {
    expect(alignIdleCauses([{ cause: "ramping", units: 1 }], null)).toEqual([
      { cause: "ramping", units: 1 },
    ]);
  });
});

describe("turns to a full run", () => {
  it("counts multiplicative steps from the floor and additive steps under the plan stage", () => {
    expect(turnsToFullRun(0.01, false)).toBe(33);
    expect(turnsToFullRun(0.01, true)).toBe(7);
    expect(turnsToFullRun(1, false)).toBe(0);
  });
});
