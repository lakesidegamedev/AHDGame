import { describe, expect, it } from "vitest";
import { TECH_INPUT_EFFICIENCY_CAP } from "@/lib/constants/techTree/effects";
import { inputEfficiencyHeadroom } from "./inputEfficiencyHeadroom";

const input = (pct: number) => ({ kind: "inputEfficiency" as const, pct });

describe("inputEfficiencyHeadroom", () => {
  it("has no remaining benefit when only input reductions remain and the cap is reached", () => {
    const r = inputEfficiencyHeadroom([input(0.02)], "sector", TECH_INPUT_EFFICIENCY_CAP);
    expect(r.noRemainingBenefit).toBe(true);
    expect(r.applied).toBe(0);
  });
  it("keeps the node usable and reports what is left when the cap clips only part of it", () => {
    const r = inputEfficiencyHeadroom([input(0.05)], "sector", TECH_INPUT_EFFICIENCY_CAP - 0.02);
    expect(r.noRemainingBenefit).toBe(false);
    expect(r.applied).toBeCloseTo(0.02);
  });
  it("keeps a node that also does something else", () => {
    const r = inputEfficiencyHeadroom(
      [input(0.02), { kind: "plantOutput", pct: 0.01 }],
      "sector",
      TECH_INPUT_EFFICIENCY_CAP
    );
    expect(r.noRemainingBenefit).toBe(false);
  });
});
