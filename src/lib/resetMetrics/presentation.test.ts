import { describe, expect, it } from "vitest";
import { primaryMetrics } from "./catalog";
import {
  metricAggregationLabel,
  metricOwnerLabel,
  metricRefreshLabel,
  metricFreshnessLabel,
  playerMetricDescription,
  playerMetricDescriptionIds,
} from "./presentation";

describe("reset metric player presentation", () => {
  it("distinguishes publication freshness from board age and unknown legacy timestamps", () => {
    expect(metricFreshnessLabel(311)).toBe("Last updated: turn 311");
    expect(metricFreshnessLabel(289, true)).toBe("Oldest regional update: turn 289");
    expect(metricFreshnessLabel(undefined)).toBe("Last updated: not recorded");
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
});
