import { describe, expect, it } from "vitest";
import { primaryMetrics } from "./catalog";
import {
  metricAggregationLabel,
  metricDisplayUnit,
  metricHasPolicyPressure,
  metricOwnerLabel,
  metricRefreshLabel,
  metricDomainId,
  metricFreshnessLabel,
  playerMetricDescription,
  playerMetricDescriptionIds,
} from "./presentation";

describe("reset metric player presentation", () => {
  it("distinguishes publication freshness from board age and unknown legacy timestamps", () => {
    expect(metricFreshnessLabel(311)).toBe("Last updated: turn 311");
    expect(metricFreshnessLabel(289, true)).toBe("Oldest regional update: turn 289");
    expect(metricFreshnessLabel(undefined)).toBe("Last updated: not recorded");
    expect(metricFreshnessLabel(48, true, "election")).toBe("From the election on turn 48");
  });
  it("authors readable drilldown copy for every primary metric", () => {
    expect(new Set(playerMetricDescriptionIds)).toEqual(
      new Set(primaryMetrics.map((row) => row.id))
    );
    for (const metric of primaryMetrics) {
      const description = playerMetricDescription(metric);
      expect(description.length).toBeGreaterThan(40);
      expect(description).not.toMatch(/[a-z][A-Z]/);
    }
  });

  it("translates internal measurement values into player language", () => {
    const unemployment = primaryMetrics.find((metric) => metric.id === "01")!;
    expect(playerMetricDescription(unemployment)).not.toContain("laborParticipation");
    expect(metricOwnerLabel(unemployment.owner)).toBe("Labor market");
    expect(metricRefreshLabel(unemployment.refresh)).toBe("Every turn");
    expect(metricAggregationLabel(unemployment.aggregation)).toContain(
      "underlying people or events"
    );
  });

  it("groups military readiness with energy security", () => {
    expect(metricDomainId({ id: "57", path: "governance.militaryReadiness" })).toBe("security");
    expect(metricDomainId({ id: "58", path: "security.energySecurity" })).toBe("security");
    expect(metricDomainId({ id: "48", path: "governance.corruptionIndex" })).toBe("governance");
  });
});

it("does not label a modeled index as days or an unrelated opening era", () => {
  expect(metricDisplayUnit("treatment-delay index, later median days")).toContain(
    "20 is the typical wait"
  );
  expect(metricDisplayUnit("treatment-delay index")).toContain("40 is twice as long");
  expect(metricDisplayUnit("1991 country housing-burden index")).toContain(
    "100 is the country's typical burden"
  );
  expect(metricDisplayUnit("1991 country housing-burden index")).not.toContain("days");
  expect(metricDisplayUnit("median days")).toBe("median days");
  expect(metricDisplayUnit("% disposable income spent on housing")).toBe(
    "% disposable income spent on housing"
  );
});

it("does not count inherited zero-net laws as active pressure", () => {
  expect(
    metricHasPolicyPressure({
      policyPressure: { combined: 0 },
      legislativeEffect: { favorableNormalizedPoints: 1.31 },
    })
  ).toBe(false);
  expect(metricHasPolicyPressure({ policyPressure: { combined: -0.2 } })).toBe(true);
  expect(
    metricHasPolicyPressure({
      temporaryActionEffect: { favorableNormalizedPoints: 0.2 },
      legislativeEffect: { favorableNormalizedPoints: -0.2 },
    })
  ).toBe(false);
});
