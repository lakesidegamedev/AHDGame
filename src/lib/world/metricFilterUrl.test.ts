import { describe, expect, it } from "vitest";
import {
  compareCategoryParam,
  metricFilterParam,
  parseCompareCategoryParam,
  parseMetricFilterParam,
} from "./metricFilterUrl";

describe("metricFilterParam", () => {
  it("round trips every filter kind", () => {
    const filters = [
      { type: "none" },
      { type: "overall" },
      { type: "party" },
      { type: "corps" },
      { type: "blocs" },
      { type: "category", categoryId: "economic" },
      { type: "metric", categoryId: "economic", metricId: "gdpGrowth" },
    ] as const;
    for (const filter of filters) {
      expect(parseMetricFilterParam(metricFilterParam(filter))).toEqual(filter);
    }
  });

  it("writes readable tokens", () => {
    expect(metricFilterParam({ type: "blocs" })).toBe("blocs");
    expect(metricFilterParam({ type: "category", categoryId: "social" })).toBe("category:social");
    expect(
      metricFilterParam({ type: "metric", categoryId: "economic", metricId: "gdpGrowth" })
    ).toBe("metric:economic:gdpGrowth");
  });

  it("returns null for absent, unknown or malformed values", () => {
    expect(parseMetricFilterParam(null)).toBeNull();
    expect(parseMetricFilterParam("")).toBeNull();
    expect(parseMetricFilterParam("rainbow")).toBeNull();
    expect(parseMetricFilterParam("category:not-a-category")).toBeNull();
    expect(parseMetricFilterParam("metric:economic")).toBeNull();
    expect(parseMetricFilterParam("metric:economic:not-a-metric")).toBeNull();
    expect(parseMetricFilterParam("metric:not-a-category:gdpGrowth")).toBeNull();
    expect(parseMetricFilterParam("none:extra")).toBeNull();
  });
});

describe("compareCategoryParam", () => {
  it("omits the default category and writes the others", () => {
    expect(compareCategoryParam("economic")).toBeNull();
    expect(compareCategoryParam("social")).toBe("social");
  });

  it("parses only known categories", () => {
    expect(parseCompareCategoryParam("social")).toBe("social");
    expect(parseCompareCategoryParam(null)).toBeNull();
    expect(parseCompareCategoryParam("not-a-category")).toBeNull();
  });
});
