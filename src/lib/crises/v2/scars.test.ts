import { describe, expect, it } from "vitest";
import { layScars, scarHorizon, scarRemaining, scarTargets, stepScars } from "./scars";
import { makeDefinition } from "./testFixtures";
import type { CrisisScar, ScarRule } from "./types";

const rule: ScarRule = {
  id: "lost-output",
  kind: "population",
  onStage: "aftermath",
  minPeakSeverity: 50,
  magnitudePerPoint: 0.001,
  recoveryTurns: 20,
};

const def = makeDefinition({ scarRules: [rule] });

describe("layScars", () => {
  it("lays nothing before the stage or when the peak stayed under the floor", () => {
    expect(layScars(def, { stage: "peak", peakSeverity: 90, scars: [] }, ["US"], 10)).toEqual([]);
    expect(layScars(def, { stage: "aftermath", peakSeverity: 50, scars: [] }, ["US"], 10)).toEqual(
      []
    );
  });

  it("sizes the scar from the peak above the floor, one per target", () => {
    const laid = layScars(
      def,
      { stage: "aftermath", peakSeverity: 80, scars: [] },
      ["TX", "OH"],
      10
    );
    expect(laid.map((scar) => scar.targetId)).toEqual(["TX", "OH"]);
    expect(laid[0]).toMatchObject({
      ruleId: "lost-output",
      kind: "population",
      createdTurn: 10,
      recoveryTurns: 20,
    });
    expect(laid[0].magnitude).toBeCloseTo(0.03);
  });

  it("fires a rule once, even if the crisis jumps past its stage", () => {
    const first = layScars(def, { stage: "resolved", peakSeverity: 80, scars: [] }, ["US"], 12);
    expect(first).toHaveLength(1);
    expect(
      layScars(def, { stage: "resolved", peakSeverity: 80, scars: first }, ["US"], 13)
    ).toEqual([]);
  });

  it("caps a scar at half its target", () => {
    const big = makeDefinition({ scarRules: [{ ...rule, magnitudePerPoint: 1 }] });
    const [scar] = layScars(big, { stage: "aftermath", peakSeverity: 100, scars: [] }, ["US"], 1);
    expect(scar.magnitude).toBe(0.5);
  });

  it("carries the sector a capacity scar hits", () => {
    const plant = makeDefinition({
      scarRules: [{ ...rule, kind: "plantCapacity", sectorType: "energy" }],
    });
    const [scar] = layScars(plant, { stage: "aftermath", peakSeverity: 70, scars: [] }, ["US"], 1);
    expect(scar.sectorType).toBe("energy");
  });
});

describe("scarTargets", () => {
  it("scars regions for regional crises and countries otherwise", () => {
    expect(scarTargets("state", ["US"], ["TX"])).toEqual(["TX"]);
    expect(scarTargets("local", ["US"], [])).toEqual(["US"]);
    expect(scarTargets("national", ["US"], ["TX"])).toEqual(["US"]);
  });
});

describe("healing", () => {
  const scar: CrisisScar = {
    ruleId: "r",
    kind: "population",
    targetId: "TX",
    magnitude: 0.1,
    createdTurn: 10,
    recoveryTurns: 20,
  };

  it("recovers linearly to nothing over the recovery period", () => {
    expect(scarRemaining(scar, 10)).toBeCloseTo(0.1);
    expect(scarRemaining(scar, 20)).toBeCloseTo(0.05);
    expect(scarRemaining(scar, 30)).toBe(0);
    expect(scarRemaining(scar, 99)).toBe(0);
    expect(scarHorizon([scar])).toBe(30);
  });

  it("writes the difference each step, deepening first and then healing", () => {
    const first = stepScars([scar], 10);
    expect(first.steps[0].change).toBeCloseTo(0.1);
    expect(first.scars[0].applied).toBeCloseTo(0.1);

    const second = stepScars(first.scars, 20);
    expect(second.steps[0].change).toBeCloseTo(-0.05);

    const done = stepScars(second.scars, 30);
    expect(done.steps[0].change).toBeCloseTo(-0.05);
    expect(done.scars[0].applied).toBe(0);
    expect(stepScars(done.scars, 31).steps).toEqual([]);
  });

  it("sums to zero across the whole recovery", () => {
    let scars = [scar];
    let net = 0;
    for (let turn = 10; turn <= 40; turn++) {
      const step = stepScars(scars, turn);
      scars = step.scars;
      net += step.steps.reduce((sum, s) => sum + s.change, 0);
    }
    expect(net).toBeCloseTo(0);
  });

  it("leaves output scars to be read live", () => {
    const output: CrisisScar = { ...scar, kind: "regionalOutput" };
    expect(stepScars([output], 10).steps).toEqual([]);
  });
});
