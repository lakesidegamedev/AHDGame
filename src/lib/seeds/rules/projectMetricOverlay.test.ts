import { describe, expect, it } from "vitest";
import { projectMetricOverlay } from "./projectMetricOverlay";

const base = {
  A: { "governance.debtToGdp": 100, "social.childPoverty": 10, "economic.propertyValueIndex": 120 },
  B: {
    "governance.debtToGdp": 100,
    "social.childPoverty": 99.5,
    "economic.propertyValueIndex": 80,
  },
};

describe("projectMetricOverlay", () => {
  it("applies set, scale, shift and region shifts in order", () => {
    const projected = projectMetricOverlay(base, {
      set: { "governance.debtToGdp": 128.7 },
      scale: { "economic.propertyValueIndex": 1.1 },
      shift: { "social.childPoverty": 1 },
      regionShift: { A: { "economic.propertyValueIndex": 5 } },
    });
    expect(projected.A).toEqual({
      "governance.debtToGdp": 128.7,
      "social.childPoverty": 11,
      "economic.propertyValueIndex": 137,
    });
    expect(projected.B["economic.propertyValueIndex"]).toBe(88);
  });

  it("keeps values inside the metric's defined bounds", () => {
    const projected = projectMetricOverlay(base, { shift: { "social.childPoverty": 5 } });
    expect(projected.B["social.childPoverty"]).toBe(95);
  });

  it("rejects an unknown metric or region", () => {
    expect(() => projectMetricOverlay(base, { shift: { "social.unknown": 1 } })).toThrow(
      /social.unknown/
    );
    expect(() =>
      projectMetricOverlay(base, { regionShift: { Z: { "social.childPoverty": 1 } } })
    ).toThrow(/region Z/);
  });
});
