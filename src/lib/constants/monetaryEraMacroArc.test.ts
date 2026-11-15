import { describe, expect, it } from "vitest";
import { getEraMonetaryBaseline, getEraTrendGdpGrowth, MACRO_ARC_START_YEAR } from "./monetaryEra";
import type { CountryId } from "./countries";

const ARC_COUNTRIES: CountryId[] = ["US", "UK", "DE", "JP", "CN"];
const SAMPLE_COUNTRIES: CountryId[] = ["US", "UK", "DE", "JP", "CN", "IT", "RU", "BR", "FR"];

describe("macro arc after 1999", () => {
  it("leaves 1999 through 2026 on the flat modern tables", () => {
    for (let year = 1999; year < MACRO_ARC_START_YEAR; year++) {
      for (const countryId of SAMPLE_COUNTRIES) {
        expect(getEraMonetaryBaseline(countryId, year), `${countryId} ${year}`).toBeUndefined();
        expect(getEraTrendGdpGrowth(countryId, year), `${countryId} ${year}`).toBeUndefined();
      }
    }
  });

  it("keeps pre-1999 resolution unchanged", () => {
    expect(getEraMonetaryBaseline("US", 1979)).toMatchObject({ targetInflation: 10 });
    expect(getEraMonetaryBaseline("IT", 1953)).toMatchObject({ targetInflation: 2.5 });
  });

  it("hits the authored anchors exactly", () => {
    expect(getEraMonetaryBaseline("US", 2027)).toEqual({
      targetInflation: 2,
      neutralPrimeRate: 2.8,
      trendGdpGrowth: 1.9,
    });
    expect(getEraMonetaryBaseline("US", 2035)).toMatchObject({
      neutralPrimeRate: 3.2,
      trendGdpGrowth: 1.7,
    });
    expect(getEraMonetaryBaseline("US", 2045)).toMatchObject({
      neutralPrimeRate: 2.9,
      trendGdpGrowth: 1.5,
    });
    expect(getEraTrendGdpGrowth("CN", 2027)).toBe(3.8);
    expect(getEraTrendGdpGrowth("CN", 2045)).toBe(2.5);
    expect(getEraTrendGdpGrowth("JP", 2045)).toBe(0.5);
  });

  it("interpolates linearly between anchors", () => {
    const mid = getEraMonetaryBaseline("US", 2031);
    expect(mid?.trendGdpGrowth).toBeCloseTo(1.8);
    expect(mid?.neutralPrimeRate).toBeCloseTo(3.0);
    expect(getEraMonetaryBaseline("DE", 2040)?.trendGdpGrowth).toBeCloseTo(0.925);
  });

  it("holds the 2045 values afterwards and never returns undefined for arc countries", () => {
    for (const countryId of ARC_COUNTRIES) {
      for (let year = 2027; year <= 2060; year++) {
        const b = getEraMonetaryBaseline(countryId, year);
        expect(b, `${countryId} ${year}`).toBeDefined();
        expect(Number.isFinite(b!.neutralPrimeRate)).toBe(true);
        expect(Number.isFinite(b!.trendGdpGrowth)).toBe(true);
      }
      expect(getEraMonetaryBaseline(countryId, 2060)).toEqual(
        getEraMonetaryBaseline(countryId, 2045)
      );
    }
  });

  it("converges growth downward and keeps targets at the modern values", () => {
    for (const countryId of ARC_COUNTRIES) {
      expect(getEraTrendGdpGrowth(countryId, 2045)!).toBeLessThan(
        getEraTrendGdpGrowth(countryId, 2027)!
      );
      expect(getEraMonetaryBaseline(countryId, 2040)?.targetInflation).toBe(
        countryId === "JP" ? 1 : 2
      );
    }
  });

  it("leaves countries without an arc on the modern fallback", () => {
    for (const year of [2027, 2040, 2060]) {
      expect(getEraMonetaryBaseline("IT", year)).toBeUndefined();
      expect(getEraMonetaryBaseline("RU", year)).toBeUndefined();
    }
  });
});
