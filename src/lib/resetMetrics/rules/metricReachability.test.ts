import { describe, expect, it } from "vitest";
import { primaryMetrics, primaryMetricById } from "../catalog";
import { COUNTRY_CONFIGS } from "@/lib/constants/countries";
import { metricCountryCoverage } from "./metricContracts";
import {
  modeledReachability,
  modeledReachabilityIds,
  ownerReachability,
} from "../testing/metricReachability";
import { driftProxyValue, policyDriftTarget } from "./policyDrift";
import { proxyResponseCalibration } from "./metricCalibration";

describe("all-metric gameplay reachability", () => {
  const rows = modeledReachability();
  it("exercises every authored country and region, both opening and later-era calibration", () => {
    expect(new Set(rows.map((r) => r.country))).toEqual(
      new Set(["US", "UK", "JP", "IE", "SCO", "WAL"])
    );
    expect(new Set(rows.map((r) => r.year))).toEqual(new Set([1991, 1996]));
    for (const row of rows) {
      expect(row.families.length, `${row.board}:${row.id} missing law mechanism`).toBeGreaterThan(
        0
      );
      expect(Number.isFinite(row.favorable) && Number.isFinite(row.adverse)).toBe(true);
      expect(
        row.favorable !== row.opening || row.adverse !== row.opening,
        `${row.board}:${row.id}:${row.year} blocked in both directions`
      ).toBe(true);
      const calibration = proxyResponseCalibration(
        primaryMetricById(row.id)!,
        row.country,
        row.year
      )!;
      const input = {
        metric: primaryMetricById(row.id)!,
        currentValue: row.opening,
        openingValue: row.opening,
        pressure: 0,
        countryId: row.country as "US" | "UK" | "JP" | "IE" | "SCO" | "WAL",
        year: row.year,
      };
      const unforced = driftProxyValue(input);
      if (row.opening >= calibration.min && row.opening <= calibration.max) {
        expect(unforced, `${row.board}:${row.id} valid unforced baseline`).toBe(row.opening);
        expect(
          (row.favorable - row.opening) * calibration.direction,
          `${row.board}:${row.id} favorable polarity`
        ).toBeGreaterThanOrEqual(0);
        expect(
          (row.adverse - row.opening) * calibration.direction,
          `${row.board}:${row.id} adverse polarity`
        ).toBeLessThanOrEqual(0);
      } else {
        // Some authored estimates exceed their physical domain. Zero policy
        // pressure must not disable the existing gradual bounds correction.
        const bounded = Math.max(calibration.min, Math.min(calibration.max, row.opening));
        expect(policyDriftTarget(input), `${row.board}:${row.id} physical target`).toBe(bounded);
        expect(Math.abs(unforced - bounded), `${row.board}:${row.id} bounds recovery`).toBeLessThan(
          Math.abs(row.opening - bounded)
        );
      }
    }
  });
  it.each([
    [100.4, 100, 100.392],
    [-0.4, 0, -0.392],
  ])(
    "corrects out-of-domain water quality %s without inventing policy pressure",
    (openingValue, target, first) => {
      const input = {
        metric: primaryMetricById("29")!,
        currentValue: openingValue,
        openingValue,
        pressure: 0,
        countryId: "US" as const,
        year: 1991,
      };
      expect(policyDriftTarget(input)).toBe(target);
      expect(driftProxyValue(input)).toBe(first);
    }
  );
  it.each(Object.keys(COUNTRY_CONFIGS))(
    "counted owner rules respond to genuine input changes in %s",
    (country) => {
      const owners = ownerReachability(country);
      expect(new Set([...modeledReachabilityIds, ...owners.map((r) => r.id)])).toEqual(
        new Set(primaryMetrics.map((m) => m.id))
      );
      expect(owners).toHaveLength(24);
      for (const row of owners) {
        expect(row.before, `${country}:${row.id} baseline`).not.toBeNull();
        expect(row.after, `${country}:${row.id} changed owner`).not.toBeNull();
        expect(Number.isFinite(row.before) && Number.isFinite(row.after)).toBe(true);
        expect(row.after, `${country}:${row.id} ${row.mechanism}`).not.toBe(row.before);
        const falls = ["01", "03", "04", "10", "18", "19", "24", "41", "42", "56"].includes(row.id);
        expect(
          (row.after! - row.before!) * (falls ? -1 : 1),
          `${country}:${row.id} owner polarity`
        ).toBeGreaterThan(0);
      }
    }
  );
  it("does not silently activate the new catalog in legacy countries", () => {
    const coverage = metricCountryCoverage(Object.keys(COUNTRY_CONFIGS));
    expect(coverage.filter((c) => c.currentPath === "reviewed-v2-catalog")).toHaveLength(6);
    expect(coverage.filter((c) => c.currentPath === "legacy").length).toBeGreaterThan(0);
  });
  it("checks old-definition fallback routes as well as complete owners", () => {
    for (const row of modeledReachability(["04", "16", "18", "19", "24", "25", "41", "42"])) {
      expect(
        row.favorable !== row.opening || row.adverse !== row.opening,
        `${row.board}:${row.id}:${row.year} incomplete-owner fallback`
      ).toBe(true);
    }
  });
  it("moves nonviolent crime despite a saturated condition score and reverses when support expires", () => {
    const cases = rows.filter((r) => r.id === "32" && (r.country === "UK" || r.country === "JP"));
    expect(cases.some((r) => r.board === "UK:LON")).toBe(true);
    expect(new Set(cases.filter((r) => r.country === "JP").map((r) => r.board)).size).toBe(8);
    for (const row of cases) {
      const input = {
        metric: primaryMetricById("32")!,
        currentValue: row.opening,
        openingValue: row.opening,
        countryId: row.country as "UK" | "JP",
        year: row.year,
        pressure: 0.5,
      };
      const first = driftProxyValue(input);
      expect(first).toBeLessThan(row.opening);
      expect(driftProxyValue({ ...input, currentValue: first, pressure: 0 })).toBeGreaterThan(
        first
      );
    }
  });
  it.each(modeledReachabilityIds)(
    "uses published units and physical bounds for modeled metric %s",
    (id) => {
      const metric = primaryMetricById(id)!;
      const calibration = proxyResponseCalibration(metric, "JP", 1991)!;
      expect(calibration.span).toBeGreaterThan(0);
      for (const openingValue of [
        calibration.min,
        Number.isFinite(calibration.max) ? calibration.max : calibration.min + calibration.span,
      ]) {
        for (const pressure of [-0.5, 0.5]) {
          const value = policyDriftTarget({
            metric,
            openingValue,
            currentValue: openingValue,
            countryId: "JP",
            year: 1991,
            pressure,
          })!;
          expect(value).toBeGreaterThanOrEqual(calibration.min);
          expect(value).toBeLessThanOrEqual(calibration.max);
        }
      }
    }
  );
  it.each(["16", "35", "56"])("preserves the transformed legacy units for alias %s", (id) => {
    const metric = primaryMetricById(id)!;
    const calibration = proxyResponseCalibration(metric, "JP", 1991)!;
    const openingValue = calibration.min + calibration.span / 2;
    const target = policyDriftTarget({
      metric,
      currentValue: openingValue,
      openingValue,
      pressure: 0.5,
      countryId: "JP",
      year: 1991,
    })!;
    expect((target - openingValue) * calibration.direction).toBeGreaterThan(0);
    expect(target).toBeGreaterThanOrEqual(calibration.min);
    expect(target).toBeLessThanOrEqual(calibration.max);
  });
});
