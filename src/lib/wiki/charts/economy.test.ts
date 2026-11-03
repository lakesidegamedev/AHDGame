import { describe, expect, it } from "vitest";
import { ECONOMY_CHARTS } from "./economy";
import { expectValidChart } from "./chartTestUtils";
import { sociMultiplier } from "@/lib/nationalization/concentrationClamp";
import { SOCI_DANGER_ZONE } from "@/lib/nationalization/constants";
import { INFAMY_PENALTY_THRESHOLD, scrutinyReliefDampener } from "@/lib/centralBank/scrutinyRules";
import { transmissionMultiplier } from "@/lib/centralBank/credibility";
import { DEFAULT_SCAR_DURATION, DEMAND_FULL_THRESHOLD } from "@/lib/sovereignDefault/constants";
import {
  DEFAULT_GUARD_DROP_PCT,
  DEFAULT_GUARD_GRACE_TURNS,
} from "@/lib/market/launchGuardConstants";
import { getInflationMarginModifier } from "@/lib/constants/corporations";
import { TURNS_PER_YEAR } from "@/lib/constants/turnTime";
import { advanceHouseholdPriceIndex } from "@/lib/economy/rules/householdPriceIndex";

const build = (id: string) => ECONOMY_CHARTS[id]();

describe("economy wiki charts", () => {
  it("every economy chart is valid", () => {
    for (const id of Object.keys(ECONOMY_CHARTS)) expectValidChart(id, build(id));
  });

  it("nationalization cost chart follows the multiplier and marks the knee", () => {
    const spec = build("nationalization-cost-multiplier");
    expect(spec.markers?.[0].x).toBe(SOCI_DANGER_ZONE);
    for (const [x, y] of spec.series[0].points) expect(y).toBeCloseTo(sociMultiplier(x), 3);
  });

  it("scrutiny chart matches both multipliers and marks the action-loss threshold", () => {
    const spec = build("central-bank-scrutiny-multipliers");
    expect(spec.markers?.[0].x).toBe(INFAMY_PENALTY_THRESHOLD);
    const at = (name: string, x: number) =>
      spec.series.find((s) => s.name === name)?.points.find((p) => p[0] === x)?.[1];
    expect(at("Scrutiny relief dampener", 100)).toBeCloseTo(scrutinyReliefDampener(100), 3);
    expect(at("Rate move credibility", 50)).toBeCloseTo(transmissionMultiplier(50), 3);
  });

  it("default scar fades to zero at the scar duration", () => {
    const spec = build("sovereign-default-scar-decay");
    const pts = spec.series[0].points;
    expect(pts[pts.length - 1][0]).toBe(DEFAULT_SCAR_DURATION);
    expect(pts[pts.length - 1][1]).toBe(0);
    expect(pts[0][1]).toBeLessThan(0);
  });

  it("demand curve carries the full-subscription threshold", () => {
    const spec = build("sovereign-default-demand-curve");
    expect(spec.markers?.some((m) => m.y === DEMAND_FULL_THRESHOLD)).toBe(true);
    const [low, high] = spec.series;
    expect(high.points[10][1]).toBeLessThan(low.points[10][1]);
  });

  it("inflation margin chart equals the game function", () => {
    const spec = build("inflation-corporate-margin-effect");
    for (const [x, y] of spec.series[0].points)
      expect(y).toBeCloseTo(getInflationMarginModifier(x), 3);
  });

  it("household index ends where the game function ends", () => {
    const spec = build("household-price-index-by-inflation");
    let index = 1;
    for (let t = 0; t < 10 * TURNS_PER_YEAR; t++) index = advanceHouseholdPriceIndex(index, 5);
    const pts = spec.series.find((s) => s.name === "Inflation 5%")!.points;
    expect(pts[pts.length - 1][1]).toBeCloseTo(index * 100, 1);
  });

  it("market guard chart uses the guard constants", () => {
    const spec = build("market-guard-trip-line");
    expect(spec.markers?.find((m) => m.y !== undefined)?.y).toBeCloseTo(
      100 * (1 - DEFAULT_GUARD_DROP_PCT),
      6
    );
    expect(spec.markers?.find((m) => m.x !== undefined)?.x).toBe(DEFAULT_GUARD_GRACE_TURNS);
  });
});
