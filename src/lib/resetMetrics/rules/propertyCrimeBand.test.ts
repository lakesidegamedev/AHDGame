import { describe, expect, it } from "vitest";
import { primaryMetricById } from "../catalog";
import { resetMetricConditionScore } from "../conditionScore";
import { policyDriftTarget } from "./policyDrift";
import { propertyCrimeBand } from "./propertyCrimeBand";

const property = primaryMetricById("32")!;

describe("property crime scale", () => {
  it("centres a modern US rate near the middle instead of near the top", () => {
    const score = resetMetricConditionScore(property, 1772, "US", 2027)!;
    expect(score).toBeGreaterThan(40);
    expect(score).toBeLessThan(60);
    expect(resetMetricConditionScore(property, 3400, "US", 2027)!).toBeLessThan(10);
  });

  it("scores 1991 against its own era", () => {
    const score = resetMetricConditionScore(property, 5388, "US", 1991)!;
    expect(score).toBeGreaterThan(40);
    expect(score).toBeLessThan(60);
  });

  it("keeps a full-strength pressure swing to about a quarter of the rate", () => {
    const worse = policyDriftTarget({
      metric: property,
      openingValue: 1772,
      currentValue: 1772,
      pressure: -0.5,
      countryId: "US",
      year: 2027,
    })!;
    expect(worse).toBeGreaterThan(1772);
    expect(worse / 1772).toBeLessThan(1.3);
  });

  it("leaves countries without anchors on the legacy scale", () => {
    expect(propertyCrimeBand("UK", 2027)).toBeNull();
    expect(resetMetricConditionScore(property, 2000, "UK", 2027)).not.toBeNull();
  });
});
