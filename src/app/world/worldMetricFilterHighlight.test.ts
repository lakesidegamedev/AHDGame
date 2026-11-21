import { describe, expect, it } from "vitest";
import { getMetricFilterHighlight, getWorldMetricsCountry } from "./worldMetricFilterHighlight";
import type { WorldMetricsCountry, WorldMetricsData } from "./WorldMetricFilterContext";

function entry(countryId: string, overallScore: number): WorldMetricsCountry {
  return {
    countryId,
    name: countryId,
    hasData: true,
    overallScore,
    categories: {},
    categoryScores: {},
  };
}

describe("world metric highlights", () => {
  const uk = entry("UK", 63);
  const canada = entry("CA", 73);
  const data: WorldMetricsData = {
    countries: { "826": uk },
    countriesById: { CA: canada, UK: uk },
    availableCategories: [],
    availableMetrics: {},
  };

  it("shows a country ranked in the full feed even when absent from the ISO subset", () => {
    expect(getMetricFilterHighlight({ type: "overall" }, "CA", "124", data, {}, null)).toEqual({
      label: "Overall score",
      value: "73",
    });
  });

  it("uses an overlay owner's score and never borrows the score of its former nation", () => {
    expect(getWorldMetricsCountry(data, "SCO", "826")).toBeUndefined();
    expect(
      getWorldMetricsCountry({ ...data, countriesById: { SCO: entry("SCO", 44) } }, "SCO", "826")
        ?.overallScore
    ).toBe(44);
    expect(getWorldMetricsCountry({ ...data, countriesById: undefined }, "UK", "826")).toEqual(uk);
  });
});
