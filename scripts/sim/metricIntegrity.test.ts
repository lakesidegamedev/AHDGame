import { describe, it, expect } from "vitest";
import { simulateMetricIntegrity } from "./metricIntegrity";
describe("six-country metric integrity trajectories", () => {
  it("preserves funding sensitivity, enactment dates, repeal and coherent owner inputs over 192 turns", () => {
    const result = simulateMetricIntegrity();
    expect(result.results).toHaveLength(36);
    expect(result.checks.nationalUnemployment.countBased).toBe(10);
    expect(result.checks.turnoutWithoutDoubleCounting).toBe(70);
  });
});
