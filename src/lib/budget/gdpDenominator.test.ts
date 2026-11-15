import { describe, expect, it } from "vitest";
import { compoundGdpLevel } from "@/lib/metricEngine/gdpLevel";
import { gdpWeightedGrowth } from "@/lib/country/nationalGdpGrowth";
import {
  flowToRatioGdp,
  impliedAnnualGrowthPct,
  liveNationalGdpUnits,
  resolveRatioGdp,
} from "./gdpDenominator";

const TURNS_PER_YEAR = 48;

describe("resolveRatioGdp", () => {
  it("prefers gdpSmoothed", () => {
    expect(resolveRatioGdp({ gdp: 1000, gdpSmoothed: 900 })).toBe(900);
  });

  it("falls back to raw gdp when smoothed is absent", () => {
    expect(resolveRatioGdp({ gdp: 1000 })).toBe(1000);
  });

  it("falls back to raw gdp when smoothed is zero or negative", () => {
    expect(resolveRatioGdp({ gdp: 1000, gdpSmoothed: 0 })).toBe(1000);
    expect(resolveRatioGdp({ gdp: 1000, gdpSmoothed: -5 })).toBe(1000);
  });

  it("falls back to raw gdp when smoothed is non-finite", () => {
    expect(resolveRatioGdp({ gdp: 1000, gdpSmoothed: Number.NaN })).toBe(1000);
  });

  it("returns 0 when nothing usable is present", () => {
    expect(resolveRatioGdp({})).toBe(0);
    expect(resolveRatioGdp({ gdp: 0 })).toBe(0);
    expect(resolveRatioGdp({ gdp: -5 })).toBe(0);
  });
});

describe("liveNationalGdpUnits", () => {
  it("sums regional millions into base currency units", () => {
    expect(liveNationalGdpUnits([{ gdp: 1000 }, { gdp: 500 }])).toBe(1_500_000_000);
  });

  it("treats a missing regional gdp as zero", () => {
    expect(liveNationalGdpUnits([{}, { gdp: 2 }])).toBe(2_000_000);
  });

  it("treats a non-finite regional gdp as zero rather than propagating NaN", () => {
    expect(liveNationalGdpUnits([{ gdp: Number.NaN }, { gdp: 2 }])).toBe(2_000_000);
  });

  it("returns 0 for no regions", () => {
    expect(liveNationalGdpUnits([])).toBe(0);
  });
});

describe("flowToRatioGdp", () => {
  it("uses the same smoothed basis as the stored debt ratio", () => {
    expect(flowToRatioGdp(-90, { gdp: 1000, gdpSmoothed: 900 })).toBeCloseTo(-0.1, 12);
  });

  it("falls back to raw gdp and returns null with no usable denominator", () => {
    expect(flowToRatioGdp(50, { gdp: 1000 })).toBeCloseTo(0.05, 12);
    expect(flowToRatioGdp(50, {})).toBeNull();
  });

  it("treats a missing or non-finite flow as zero", () => {
    expect(flowToRatioGdp(undefined, { gdp: 1000 })).toBe(0);
    expect(flowToRatioGdp(Number.NaN, { gdp: 1000 })).toBe(0);
  });
});

describe("impliedAnnualGrowthPct", () => {
  it("inverts compoundGdpLevel for any annual rate", () => {
    for (const rate of [-8, -0.5, 0, 2.5, 13.8]) {
      const next = compoundGdpLevel(1234, rate, TURNS_PER_YEAR);
      expect(impliedAnnualGrowthPct(1234, next, TURNS_PER_YEAR)).toBeCloseTo(rate, 6);
    }
  });

  it("is null for an unusable level", () => {
    expect(impliedAnnualGrowthPct(0, 10, TURNS_PER_YEAR)).toBeNull();
    expect(impliedAnnualGrowthPct(10, Number.NaN, TURNS_PER_YEAR)).toBeNull();
  });
});

describe("growth units over many simulated years", () => {
  const regions = () => [
    { gdp: 5000, growth: 3 },
    { gdp: 2000, growth: -4 },
    { gdp: 800, growth: 9 },
  ];

  it("a constant annual rate stays exactly that rate across 30 years", () => {
    let gdp = 1000;
    for (let year = 1; year <= 30; year++) {
      const start = gdp;
      for (let t = 0; t < TURNS_PER_YEAR; t++) gdp = compoundGdpLevel(gdp, 2.5, TURNS_PER_YEAR);
      expect(impliedAnnualGrowthPct(start, gdp, 1)).toBeCloseTo(2.5, 6);
    }
    expect(gdp).toBeCloseTo(1000 * 1.025 ** 30, 4);
  });

  it("per-turn reported national growth matches the realised level change", () => {
    const rs = regions();
    for (let turn = 0; turn < 20 * TURNS_PER_YEAR; turn++) {
      const prevTotal = rs.reduce((sum, r) => sum + r.gdp, 0);
      const reported = gdpWeightedGrowth(rs.map((r) => ({ growth: r.growth, gdp: r.gdp })));
      for (const r of rs) r.gdp = compoundGdpLevel(r.gdp, r.growth, TURNS_PER_YEAR);
      const nextTotal = rs.reduce((sum, r) => sum + r.gdp, 0);
      // Weights are start-of-turn GDP, so the only gap is the tenth-of-a-point
      // curvature of annualising a one-turn step.
      const realised = impliedAnnualGrowthPct(prevTotal, nextTotal, TURNS_PER_YEAR)!;
      expect(Math.abs(realised - reported!)).toBeLessThan(0.15);
    }
  });

  it("the stored ratio basis never drifts from the level it smooths", () => {
    const rs = regions();
    const debt = 1_000_000_000;
    let ratio = 0;
    for (let turn = 0; turn < 10 * TURNS_PER_YEAR; turn++) {
      for (const r of rs) r.gdp = compoundGdpLevel(r.gdp, r.growth, TURNS_PER_YEAR);
      const live = liveNationalGdpUnits(rs);
      ratio = flowToRatioGdp(debt, { gdp: live }) ?? 0;
      expect(ratio).toBeCloseTo(debt / live, 12);
    }
    expect(ratio).toBeGreaterThan(0);
  });
});
