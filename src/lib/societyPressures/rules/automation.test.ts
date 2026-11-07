import { describe, expect, it } from "vitest";
import {
  AUTOMATION_LABOUR_FACTORS,
  BASE_ABSORPTION_HALF_LIFE_YEARS,
  absorptionHalfLifeYears,
  advanceAutomationAbsorption,
  automationLabourFactor,
  displacedWorkers,
} from "./automation";
import { advanceEmployment, type EmploymentState } from "@/lib/labour/rules/employment";
import { aiLabourAnnualProbability } from "@/lib/livingConflict/rules/futureConflicts";

const TPY = 48;

describe("automationLabourFactor", () => {
  it("cuts crew per unit for the four automation methods when enabled", () => {
    for (const id of [
      "humanoid_robotics",
      "agentic_services",
      "autonomous_factory",
      "autonomous_freight",
    ]) {
      expect(automationLabourFactor(id, true)).toBe(AUTOMATION_LABOUR_FACTORS[id]);
      expect(automationLabourFactor(id, true)).toBeLessThan(1);
    }
  });

  it("is 1 for other methods and for worlds that do not opt in", () => {
    expect(automationLabourFactor("standard", true)).toBe(1);
    expect(automationLabourFactor(undefined, true)).toBe(1);
    expect(automationLabourFactor("humanoid_robotics", false)).toBe(1);
  });

  it("recovers the shed crew from the reduced one", () => {
    expect(displacedWorkers(50, 0.5)).toBe(50);
    expect(displacedWorkers(40, 0.4)).toBeCloseTo(60, 9);
    expect(displacedWorkers(40, 1)).toBe(0);
  });
});

describe("absorption", () => {
  it("takes a few years with no help, less with wage insurance and a hot economy", () => {
    const unaided = absorptionHalfLifeYears({ wageInsuranceSupport: 0 });
    expect(unaided).toBe(BASE_ABSORPTION_HALF_LIFE_YEARS);
    expect(absorptionHalfLifeYears({ wageInsuranceSupport: 1 })).toBeLessThan(unaided);
    expect(absorptionHalfLifeYears({ wageInsuranceSupport: 0, outputGap: 4 })).toBeLessThan(
      unaided
    );
    expect(absorptionHalfLifeYears({ wageInsuranceSupport: 0, outputGap: -4 })).toBeGreaterThan(
      unaided
    );
    expect(absorptionHalfLifeYears({ wageInsuranceSupport: 0, educationIndex: 60 })).toBeLessThan(
      unaided
    );
  });

  it("closes half the gap in one half-life and never overshoots", () => {
    let absorbed = 0;
    for (let t = 0; t < TPY * 3; t++)
      absorbed = advanceAutomationAbsorption({
        displaced: 1000,
        previousAbsorbed: absorbed,
        turnsPerYear: TPY,
        halfLifeYears: 3,
      });
    expect(absorbed).toBeCloseTo(500, 6);
    expect(
      advanceAutomationAbsorption({
        displaced: 100,
        previousAbsorbed: 400,
        turnsPerYear: TPY,
        halfLifeYears: 3,
      })
    ).toBeLessThanOrEqual(100);
  });
});

describe("displacement through the employment market", () => {
  /** A region where automation removes 5% of the workforce's corporate jobs at turn 1. */
  function run(halfLifeYears: number, years: number): number[] {
    const laborForce = 1_000_000;
    const before = 400_000;
    const shed = 50_000;
    let previous: EmploymentState | undefined;
    let unemployment = 5;
    let absorbed = 0;
    const byYear: number[] = [];
    for (let turn = 0; turn <= years * TPY; turn++) {
      const displaced = turn === 0 ? 0 : shed;
      absorbed = advanceAutomationAbsorption({
        displaced,
        previousAbsorbed: absorbed,
        turnsPerYear: TPY,
        halfLifeYears,
      });
      const step = advanceEmployment({
        turn,
        turnsPerYear: TPY,
        laborForce,
        unemployment,
        corporateDemand: before - displaced,
        absorbedJobs: absorbed,
        previous,
      });
      previous = step.state;
      unemployment = step.unemployment;
      if (turn % TPY === 0) byYear.push(unemployment);
    }
    return byYear;
  }

  it("raises unemployment at once and lets it fall back over a few years", () => {
    const path = run(3, 8);
    const opening = path[0];
    const peak = Math.max(...path);
    expect(peak).toBeGreaterThan(opening + 3);
    expect(path[8]).toBeLessThan(peak - 2);
  });

  it("recovers faster with wage insurance", () => {
    const unaided = run(absorptionHalfLifeYears({ wageInsuranceSupport: 0 }), 3);
    const insured = run(absorptionHalfLifeYears({ wageInsuranceSupport: 1 }), 3);
    expect(insured[3]).toBeLessThan(unaided[3]);
  });

  it("feeds the AI labour shock trigger through rising unemployment", () => {
    const path = run(3, 2);
    const signal = (unemployment: number, trend: number) =>
      aiLabourAnnualProbability({
        countryId: "US",
        automationShare: 0.3,
        unemployment,
        unemploymentTrend: trend,
      });
    expect(signal(path[1], path[1] - path[0])).toBeGreaterThan(signal(path[0], 0));
  });
});
