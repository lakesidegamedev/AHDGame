import { describe, expect, it } from "vitest";
import { compoundGdpLevel } from "./gdpLevel";
import {
  GDP_SMOOTHING_INERTIA,
  PRICE_INDEX_BASE,
  advancePriceIndex,
  perTurnPriceFactor,
  resolvePriceIndex,
  smoothNationalGdpPerTurn,
  toNominalOutput,
  toRealOutput,
} from "./priceLevel";

const TURNS_PER_YEAR = 48;

describe("price index", () => {
  it("reads absent, zero and non-finite values as the base", () => {
    expect(resolvePriceIndex(undefined)).toBe(PRICE_INDEX_BASE);
    expect(resolvePriceIndex(0)).toBe(PRICE_INDEX_BASE);
    expect(resolvePriceIndex(Number.NaN)).toBe(PRICE_INDEX_BASE);
    expect(resolvePriceIndex(2.5)).toBe(2.5);
  });

  it("compounds to the annual rate over a year, exact per-turn root", () => {
    let index = PRICE_INDEX_BASE;
    for (let t = 0; t < TURNS_PER_YEAR; t++) index = advancePriceIndex(index, 4, TURNS_PER_YEAR);
    expect(index).toBeCloseTo(1.04, 9);
  });

  it("is a no-op at zero or non-finite inflation", () => {
    expect(advancePriceIndex(1.7, 0, TURNS_PER_YEAR)).toBeCloseTo(1.7, 12);
    expect(perTurnPriceFactor(Number.NaN, TURNS_PER_YEAR)).toBe(1);
  });

  it("keeps the index positive through extreme deflation", () => {
    expect(advancePriceIndex(1, -500, TURNS_PER_YEAR)).toBeGreaterThan(0);
  });

  it("converts between real and nominal output", () => {
    expect(toNominalOutput(toRealOutput(300, 1.5), 1.5)).toBeCloseTo(300, 9);
    expect(toRealOutput(300, undefined)).toBe(300);
  });
});

describe("nominal GDP path", () => {
  const step = (nominal: number, index: number, growthPct: number, inflationPct: number) => {
    const real = compoundGdpLevel(toRealOutput(nominal, index), growthPct, TURNS_PER_YEAR);
    const nextIndex = advancePriceIndex(index, inflationPct, TURNS_PER_YEAR);
    return { nominal: toNominalOutput(real, nextIndex), index: nextIndex, real };
  };

  it("matches the real-only level when there is no inflation (turn-1 parity)", () => {
    const first = step(1_000_000, PRICE_INDEX_BASE, 3, 0);
    expect(first.nominal).toBeCloseTo(compoundGdpLevel(1_000_000, 3, TURNS_PER_YEAR), 6);
    expect(first.index).toBe(1);
  });

  it("grows by real growth times inflation, and reported growth stays real", () => {
    let nominal = 1_000_000;
    let real = 1_000_000;
    let index = PRICE_INDEX_BASE;
    for (let t = 0; t < TURNS_PER_YEAR; t++) {
      const next = step(nominal, index, 2, 3);
      nominal = next.nominal;
      index = next.index;
      real = next.real;
    }
    expect(nominal / 1_000_000).toBeCloseTo(1.02 * 1.03, 6);
    expect(real / 1_000_000).toBeCloseTo(1.02, 6);
  });

  it("holds debt over GDP flat for 24 years of inflation when debt grows at the nominal rate", () => {
    let nominal = 2_000_000;
    let index = PRICE_INDEX_BASE;
    let debt = nominal * 0.6;
    let smoothed = nominal;
    const opening = debt / smoothed;
    for (let t = 0; t < 24 * TURNS_PER_YEAR; t++) {
      const next = step(nominal, index, 2, 3);
      debt *= next.nominal / nominal;
      nominal = next.nominal;
      index = next.index;
      smoothed = smoothNationalGdpPerTurn(smoothed, nominal, GDP_SMOOTHING_INERTIA, TURNS_PER_YEAR);
    }
    // Prices more than doubled, so the nominal level is not noise.
    expect(index).toBeGreaterThan(2);
    const closing = debt / smoothed;
    // Smoothing lags a trending series by a constant factor, so the ratio settles
    // instead of drifting with the price level.
    expect(closing / opening).toBeGreaterThan(1);
    expect(closing / opening).toBeLessThan(1.15);
  });

  it("drifts without a price level when debt is nominal against real GDP", () => {
    let real = 2_000_000;
    let debt = real * 0.6;
    for (let t = 0; t < 24 * TURNS_PER_YEAR; t++) {
      debt *= 1.0498 ** (1 / TURNS_PER_YEAR); // nominal ~ (1.02)(1.03)
      real = compoundGdpLevel(real, 2, TURNS_PER_YEAR);
    }
    expect(debt / real).toBeGreaterThan(0.6 * 1.5);
  });
});

describe("per-turn smoothing", () => {
  it("cold-starts to the current level", () => {
    expect(smoothNationalGdpPerTurn(undefined, 500, GDP_SMOOTHING_INERTIA, TURNS_PER_YEAR)).toBe(
      500
    );
  });

  it("closes the same share of a step in a year as the annual average does", () => {
    let smoothed = 100;
    for (let t = 0; t < TURNS_PER_YEAR; t++)
      smoothed = smoothNationalGdpPerTurn(smoothed, 200, GDP_SMOOTHING_INERTIA, TURNS_PER_YEAR);
    expect(smoothed).toBeCloseTo(0.7 * 100 + 0.3 * 200, 6);
  });

  it("cold-starts from a prior that is a placeholder, not smoothing lag", () => {
    expect(smoothNationalGdpPerTurn(27_000_000_000_000, 800_000_000_000, 0.7, TURNS_PER_YEAR)).toBe(
      800_000_000_000
    );
  });
});
