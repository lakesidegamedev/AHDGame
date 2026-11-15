import { describe, expect, it } from "vitest";
import {
  effectiveGdpBaseline,
  gdpBaselinePerCapita,
  nationalGdpPerCapitaFromStates,
  nationalGdpPerCapitaIndex,
  requireNationalGdpPerCapita,
} from "./gdpBaseline";
import { getFundMultiplier } from "@/lib/actions/rules";
import { getIncomeGdpScalar } from "@/lib/utils/fundGeneration";

const POP = 1_000_000;
const gdpFor = (perCapita: number) => (perCapita * POP) / 1_000_000;

describe("live campaign GDP baseline", () => {
  it("matches the era table at world start", () => {
    for (const preset of ["1953-default", "1979-default", "2019-default", "2027-default"]) {
      const start = gdpBaselinePerCapita("US", preset);
      expect(effectiveGdpBaseline("US", preset)).toBe(start);
      expect(effectiveGdpBaseline("US", preset, start)).toBe(start);
      for (const ratio of [0.8, 1, 1.3]) {
        const gdp = gdpFor(start * ratio);
        expect(getIncomeGdpScalar(gdp, POP, "US", preset, start)).toBe(
          getIncomeGdpScalar(gdp, POP, "US", preset)
        );
        expect(getFundMultiplier(2, gdp, POP, "US", preset, 1, start)).toBe(
          getFundMultiplier(2, gdp, POP, "US", preset)
        );
      }
    }
  });

  it("stays off the clamps over a 24 year growth path", () => {
    const preset = "2027-default";
    const start = gdpBaselinePerCapita("US", preset);
    const regions = [0.95, 1, 1.2];
    for (let year = 0; year <= 24; year++) {
      const national = start * 1.04 ** year;
      regions.forEach((ratio) => {
        const gdp = gdpFor(national * ratio);
        expect(getIncomeGdpScalar(gdp, POP, "US", preset, national)).toBeCloseTo(ratio, 10);
        expect(getFundMultiplier(0, gdp, POP, "US", preset, 1, national)).toBeCloseTo(ratio, 10);
      });
    }
    // The static baseline would have pinned every region to its clamp by now.
    const finalNational = start * 1.04 ** 24;
    const gdp = gdpFor(finalNational * 1.2);
    expect(getIncomeGdpScalar(gdp, POP, "US", preset)).toBe(1.5);
    expect(getFundMultiplier(0, gdp, POP, "US", preset)).toBe(2);
  });

  it("throws on an unusable live figure instead of using the era table", () => {
    for (const bad of [0, -5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => effectiveGdpBaseline("US", "2019-default", bad)).toThrow();
    }
  });

  it("derives national GDP per capita per country and throws for a missing one", () => {
    const index = nationalGdpPerCapitaIndex([
      { countryId: "US", gdp: 10, population: 1_000_000 },
      { countryId: "US", gdp: 30, population: 1_000_000 },
      { countryId: "UK", gdp: 0, population: 1_000_000 },
    ]);
    expect(requireNationalGdpPerCapita(index, "US")).toBe(20);
    expect(() => requireNationalGdpPerCapita(index, "UK")).toThrow();
    expect(() => requireNationalGdpPerCapita(index, "DE")).toThrow();
    expect(
      nationalGdpPerCapitaFromStates([{ countryId: "US", gdp: 5, population: 1_000_000 }], "US")
    ).toBe(5);
    expect(() => nationalGdpPerCapitaFromStates([], "US")).toThrow();
  });
});
