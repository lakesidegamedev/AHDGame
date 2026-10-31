import { describe, expect, it } from "vitest";
import { PARTIES_CHARTS } from "./parties";
import { expectValidChart } from "./chartTestUtils";
import { ORG_DECAY_GRACE_TURNS } from "@/lib/constants/partyOrg";
import {
  PRESSURE_LADDER_MAX_COST,
  STATE_PS_CAP_DEFAULT,
} from "@/lib/politicalStrength/strengthConstants";
import { calculateNppCeiling, calculatePartyNppCapacity } from "@/lib/npp/partyCapacity";
import { complianceFromPersonality } from "@/lib/turn/npp/complianceRules";

const build = (id: string) => PARTIES_CHARTS[id]();

describe("party charts", () => {
  it("all build valid specs", () => {
    for (const [id, fn] of Object.entries(PARTIES_CHARTS)) expectValidChart(id, fn());
  });

  it("build org cost saturates at the ladder cap", () => {
    const ps = build("build-org-click-cost").series[0].points;
    expect(Math.max(...ps.map(([, y]) => y))).toBe(PRESSURE_LADDER_MAX_COST);
  });

  it("idle org decay starts at the grace period", () => {
    const spec = build("party-org-idle-decay");
    expect(spec.markers?.[0].x).toBe(ORG_DECAY_GRACE_TURNS);
    const flat = spec.series[0].points.filter(([x]) => x < ORG_DECAY_GRACE_TURNS);
    expect(flat.every(([, y]) => y === 1)).toBe(true);
  });

  it("primary alignment fallback is the largest at zero gap", () => {
    const spec = build("primary-alignment-points");
    const at0 = spec.series.map((s) => s.points[0][1]);
    expect(at0[2]).toBeGreaterThan(at0[0]);
    expect(at0[2]).toBeGreaterThan(at0[1]);
  });

  it("PS reserve idle line tops out at the cap", () => {
    const spec = build("state-ps-reserve");
    expect(spec.markers?.[0].y).toBe(STATE_PS_CAP_DEFAULT);
    expect(Math.max(...spec.series[0].points.map(([, y]) => y))).toBe(STATE_PS_CAP_DEFAULT);
  });

  it("NPP capacity matches the capacity function", () => {
    const spec = build("npp-capacity-by-members");
    const at = spec.series[0].points.find(([x]) => x === 20)!;
    expect(at[1]).toBe(calculatePartyNppCapacity(20));
    expect(spec.markers?.[0].y).toBe(calculateNppCeiling(0));
  });

  it("compliance matches the formula", () => {
    const spec = build("npp-compliance-by-loyalty");
    const p = spec.series[1].points.find(([x]) => x === 100)!;
    expect(p[1]).toBeCloseTo(complianceFromPersonality(100, 50), 4);
  });
});
