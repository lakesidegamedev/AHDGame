import { describe, expect, it } from "vitest";
import { LEGISLATURE_CHARTS } from "./legislature";
import { expectValidChart } from "./chartTestUtils";
import {
  MAX_CONTRIBUTION,
  metricApprovalContribution,
} from "@/lib/utils/approvalContributionRules";
import { WAR_EXHAUSTION_FLOOR } from "@/lib/military/rules/warExhaustionCurve";
import { PENSION_DEFICIT_RATIO } from "@/lib/pensions/rules";
import { MINISTERIAL_ACTION_CAP } from "@/lib/constants/cabinetMechanicsTypes";
import { fundingDef } from "@/lib/constants/cabinetEstates";
import { clotureVotesRequired } from "@/lib/turn/billLifecycle/clotureRules";
import { POLICY_TAU } from "@shared/constants/formulas";
import { getProvisionCostTotal } from "@shared/constants/legislation";

const build = (id: string) => LEGISLATURE_CHARTS[id]();

describe("legislature charts", () => {
  it("all build valid specs", () => {
    for (const [id, fn] of Object.entries(LEGISLATURE_CHARTS)) expectValidChart(id, fn());
  });

  it("approval contribution follows the clamp function and cap", () => {
    const spec = build("approval-metric-contribution");
    const pts = spec.series[0].points;
    expect(Math.max(...pts.map(([, y]) => y))).toBe(MAX_CONTRIBUTION);
    const mid = pts.find(([x]) => x === 5)!;
    expect(mid[1]).toBeCloseTo(metricApprovalContribution(0.05), 4);
  });

  it("war exhaustion marker is the floor", () => {
    const spec = build("war-exhaustion-curve");
    expect(spec.markers?.[0].y).toBe(WAR_EXHAUSTION_FLOOR);
    expect(Math.min(...spec.series[0].points.map(([, y]) => y))).toBe(WAR_EXHAUSTION_FLOOR);
  });

  it("pension chart marks the deficit threshold", () => {
    const spec = build("pension-funding-by-rate");
    expect(spec.markers?.some((m) => m.y === PENSION_DEFICIT_RATIO * 100)).toBe(true);
  });

  it("provision costs match the cumulative total", () => {
    const spec = build("bill-provision-cost");
    expect(spec.series[0].points.map(([, y]) => y)).toEqual([1, 2, 3].map(getProvisionCostTotal));
  });

  it("cloture series matches the required votes function", () => {
    const spec = build("cloture-votes-required");
    const cloture = spec.series[1].points.find(([x]) => x === 100)!;
    expect(cloture[1]).toBe(clotureVotesRequired(100));
  });

  it("policy chart marks the time constant", () => {
    expect(build("policy-effect-over-time").markers?.[0].x).toBe(POLICY_TAU);
  });

  it("action bank starts below the cap and refills to it", () => {
    const spec = build("ministerial-action-bank");
    const pts = spec.series[0].points;
    expect(pts[0][1]).toBeLessThan(MINISTERIAL_ACTION_CAP);
    expect(pts[pts.length - 1][1]).toBe(MINISTERIAL_ACTION_CAP);
  });

  it("estate condition ends at the funding baselines", () => {
    const spec = build("estate-condition-drift");
    const last = (i: number) => spec.series[i].points[spec.series[i].points.length - 1][1];
    expect(last(0)).toBe(fundingDef("enhanced").conditionBaseline);
    expect(last(1)).toBe(fundingDef("reduced").conditionBaseline);
  });
});
