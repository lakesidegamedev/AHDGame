import { describe, expect, it } from "vitest";
import { linkedOutcomeTargets } from "./linkedOutcomes";
describe("linked outcome game channels", () => {
  it("uses compatible disposable income and poverty baselines without a second legacy housing target", () => {
    const result = linkedOutcomeTargets({
      opening: { "02": 100, "03": 20, "24": 0.4, "41": 10, "49": 50 },
      current: { "02": 120, "03": 10, "24": 0.3 },
      policyTargets: { "42": 20 },
      conditionChanges: [10, 20],
    });
    expect(result["24"]).toBeUndefined();
    expect(result["41"]).toBeUndefined();
    expect(result["42"]).toBeCloseTo(20 * Math.sqrt(0.5 / 1.2));
    expect(result["49"]).toBe(65);
  });
});
