import { describe, expect, it } from "vitest";
import {
  calculateDemographicShiftsByTarget,
  LEAN_SHIFT_RATE_PER_TURN,
} from "../demographicEffects";
import { regionalFamilyLeanPolicies, type RegionalLeanProgram } from "./familyLeanEffects";

const program = (over: Partial<RegionalLeanProgram>): RegionalLeanProgram => ({
  scope: "regional",
  regionId: "CHU",
  familyId: "L06",
  choice: "far_left",
  ...over,
});

function shiftsFor(over: Partial<RegionalLeanProgram>) {
  const { policiesByRegion, types } = regionalFamilyLeanPolicies([program(over)]);
  const policies = policiesByRegion.get(over.regionId ?? "CHU") ?? [];
  return { policies, shifts: calculateDemographicShiftsByTarget(policies, types) };
}

describe("regionalFamilyLeanPolicies", () => {
  it("pulls a far-left economic family left on the economic axis", () => {
    const { policies, shifts } = shiftsFor({});
    expect(policies).toHaveLength(1);
    expect(policies[0]).toMatchObject({
      stateId: "CHU",
      economic: -3,
      social: 0,
      scopeMultiplier: 1,
    });
    expect(shifts.economicLean["income:middle"]).toBeCloseTo(-0.4 * LEAN_SHIFT_RATE_PER_TURN, 12);
    expect(shifts.economicLean["income:low"]).toBeLessThan(0);
    expect(Object.keys(shifts.socialLean)).toHaveLength(0);
  });

  it("pulls a far-right family right and a centre-left family less than far left", () => {
    const right = shiftsFor({ choice: "far_right" }).shifts.economicLean["income:middle"]!;
    const mild = shiftsFor({ choice: "center_left" }).shifts.economicLean["income:middle"]!;
    const far = shiftsFor({}).shifts.economicLean["income:middle"]!;
    expect(right).toBeCloseTo(-far, 12);
    expect(mild).toBeLessThan(0);
    expect(mild).toBeGreaterThan(far);
  });

  it("moves nothing for a centre choice", () => {
    expect(shiftsFor({ choice: "center" }).policies).toEqual([]);
  });

  it("routes a social-axis family (L34) through social lean only", () => {
    const { policies, shifts } = shiftsFor({ familyId: "L34", choice: "far_right" });
    expect(policies[0]).toMatchObject({ economic: 0, social: 3 });
    expect(shifts.socialLean["age:senior"]).toBeGreaterThan(0);
    expect(Object.keys(shifts.economicLean)).toHaveLength(0);
  });

  it("skips unknown families, unknown choices, missing regions and national programs", () => {
    for (const over of [
      { familyId: "L99" },
      { choice: "sideways" as RegionalLeanProgram["choice"] },
      { regionId: undefined },
      { scope: "national" as const },
    ]) {
      expect(regionalFamilyLeanPolicies([program(over)]).policiesByRegion.size).toBe(0);
    }
  });
});
