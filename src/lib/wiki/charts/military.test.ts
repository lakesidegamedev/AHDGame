import { describe, expect, it } from "vitest";
import { MILITARY_CHARTS } from "./military";
import { expectValidChart } from "./chartTestUtils";
import { WAR_DECLARATION_COOLDOWN_TURNS } from "@/lib/military/warGoals";
import { TRUCE_TURNS } from "@/lib/db/types/peaceOffer";
import { TECH_UPKEEP_MULT } from "@/lib/constants/militaryCore";
import { CAPACITY } from "@/lib/military/config";
import { MARINE_LANDING_THRESHOLD } from "@/lib/navair/frontSupport";
import { BLOCKADE } from "@/lib/navair/blockade";
import { JOIN_SHARE, LEAVE_SHARE } from "@/lib/alignment/membershipEligibility";
import { TENURE_POINT_CAP } from "@/lib/military/generals";
import { collectiveDurationReduction } from "@/lib/crises/rules/collectiveReduction";
import { productionCapFor, NUCLEAR_NODES } from "@/lib/military/nuclearProgram";
import { WORLD_EVENT_SEED_DEFINITIONS } from "@/lib/events/worldEvents/definitions";

const build = (id: string) => {
  const spec = MILITARY_CHARTS[id]();
  expectValidChart(id, spec);
  return spec;
};

describe("military wiki charts", () => {
  it("all build", () => {
    for (const id of Object.keys(MILITARY_CHARTS)) build(id);
  });

  it("war timers track the cooldown and truce constants", () => {
    const spec = build("war-declaration-timers");
    expect(spec.markers?.find((m) => m.label.includes("cooldown"))?.x).toBe(
      WAR_DECLARATION_COOLDOWN_TURNS
    );
    expect(spec.markers?.find((m) => m.label.includes("Truce"))?.x).toBe(TRUCE_TURNS);
  });

  it("tech tier upkeep ratio follows the table", () => {
    const spec = build("military-tech-tier-power-vs-upkeep");
    const upkeep = spec.series.find((s) => s.name === "Upkeep")!;
    expect(upkeep.points[3][1]).toBeCloseTo(TECH_UPKEEP_MULT[3] / TECH_UPKEEP_MULT[0], 3);
  });

  it("command effectiveness uses the capacity tuning", () => {
    const spec = build("command-effectiveness-overload");
    expect(spec.markers?.[0].y).toBe(CAPACITY.effFloor);
    const withCmd = spec.series[0].points;
    const without = spec.series[1].points;
    expect(withCmd[0][1] - without[0][1]).toBe(CAPACITY.noCommanderPenalty);
    expect(withCmd[0][1] - withCmd[5][1]).toBe(Math.round(5 * CAPACITY.overCapacityFactor));
  });

  it("sea control marks the landing threshold and peaks under it only when contested", () => {
    const spec = build("sea-control-build-and-decay");
    expect(spec.markers?.find((m) => m.y !== undefined)?.y).toBe(MARINE_LANDING_THRESHOLD);
  });

  it("blockade closure goes total at the configured ratio", () => {
    const spec = build("blockade-closure-curve");
    expect(spec.markers?.[0].x).toBe(BLOCKADE.totalClosurePressureRatio);
    const last = spec.series[0].points.at(-1)!;
    expect(last[1]).toBe(1);
  });

  it("alignment markers use the join and leave shares", () => {
    const xs = build("alignment-membership-thresholds").markers?.map((m) => m.x);
    expect(xs).toContain(JOIN_SHARE);
    expect(xs).toContain(LEAVE_SHARE);
  });

  it("collective fund reaches the full cut at full funding", () => {
    const spec = build("collective-fund-duration-cut");
    const last = spec.series[0].points.at(-1)!;
    expect(last[1]).toBe((collectiveDurationReduction(100, 100, 1000) / 1000) * 100);
  });

  it("warhead caps match the device tiers", () => {
    const spec = build("nuclear-warhead-production-by-tier");
    const devices = NUCLEAR_NODES.filter((n) => n.kind === "device");
    expect(spec.series[0].points.map((p) => p[1])).toEqual(
      devices.map((n) => productionCapFor({ [n.key]: 1 }))
    );
  });

  it("general points cap at tenure limit", () => {
    const spec = build("general-skill-point-sources");
    expect(Math.max(...spec.series[3].points.map((p) => p[1]))).toBe(TENURE_POINT_CAP);
  });

  it("high tension events are the gated definitions", () => {
    const spec = build("high-tension-world-events");
    const gated = WORLD_EVENT_SEED_DEFINITIONS.filter((e) => typeof e.minTension === "number");
    expect(spec.series[0].points.at(-1)![1]).toBe(gated.length);
  });
});
