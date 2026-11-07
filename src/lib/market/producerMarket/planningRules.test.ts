import { describe, expect, it } from "vitest";
import {
  producerPlanningSiteChange,
  producerPlanningStop,
  producerPlanningWarnings,
} from "./planningRules";

describe("bounded supply-chain planning", () => {
  it("uses site movement rather than offsetting aggregate output", () => {
    expect(producerPlanningSiteChange("up", 100, 110, 2)).toMatchObject({
      producerId: "up",
      relativeChange: 0.1,
      referenceValueChange: 20,
    });
    expect(producerPlanningSiteChange("down", 100, 90, 2)).toBeDefined();
    expect(producerPlanningSiteChange("noise", 100, 100.001, 2)).toBeUndefined();
    expect(producerPlanningSiteChange("restart", 0, 1, 2)).toBeDefined();
  });

  it("stops immediately on convergence, otherwise respects either safety limit", () => {
    const base = { passes: 16, maximumPasses: 64, deadlineReached: false };
    expect(producerPlanningStop({ ...base, changed: true })).toBeUndefined();
    expect(producerPlanningStop({ ...base, changed: false, deadlineReached: true })).toBe(
      "converged"
    );
    expect(producerPlanningStop({ ...base, changed: true, deadlineReached: true })).toBe(
      "runtime_limit"
    );
    expect(producerPlanningStop({ ...base, changed: true, passes: 64 })).toBe("pass_limit");
  });

  it("keeps legacy receipts quiet and bounds warning details without discarding receipt sites", () => {
    expect(producerPlanningWarnings()).toEqual([]);
    const siteChanges = Array.from({ length: 8 }, (_, i) =>
      producerPlanningSiteChange(`site-${i}`, 100, 110, i + 1)!
    );
    const planning = {
      passes: 16,
      maximumPasses: 64,
      converged: false,
      stopReason: "runtime_limit" as const,
      siteChanges,
    };
    const warnings = producerPlanningWarnings(planning);
    expect(warnings[0]).toContain("8 sites still changing");
    expect(warnings[0]).toContain("site-7");
    expect(warnings[0]).not.toContain("site-0");
    expect(planning.siteChanges).toHaveLength(8);
    expect(
      producerPlanningWarnings({ ...planning, converged: true, stopReason: "converged" })
    ).toEqual([]);
  });
});
