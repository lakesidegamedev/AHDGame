import { describe, expect, it } from "vitest";
import { makeDefinition } from "./testFixtures";
import { validateCrisisDefinition } from "./definition";
import { createCrisisInstance } from "./instance";

describe("validateCrisisDefinition", () => {
  it("accepts a coherent definition", () => {
    expect(validateCrisisDefinition(makeDefinition())).toEqual([]);
  });

  it("flags inverted thresholds", () => {
    const def = makeDefinition({ thresholds: { onset: 30, peak: 60, easing: 70, resolve: 80 } });
    const problems = validateCrisisDefinition(def);
    expect(problems).toContain("resolve must be below easing");
    expect(problems).toContain("easing must be below peak");
  });

  it("flags out-of-range values, stage bounds and duplicates", () => {
    const base = makeDefinition();
    const def = makeDefinition({
      thresholds: { ...base.thresholds, surge: 10 },
      stages: { ...base.stages, peak: { minTurns: 5, maxTurns: 2 } },
      levers: [base.levers[0], base.levers[0]],
      spillover: [
        { id: "s", channel: "trade", targetDefinitionId: "x", minSeverity: 1, transmission: 2 },
      ],
      scarRules: [
        {
          id: "sc",
          kind: "plantCapacity",
          onStage: "peak",
          minPeakSeverity: 1,
          magnitudePerPoint: 1,
          recoveryTurns: 0,
        },
      ],
      forcedEvents: [{ id: "f", event: "strike", minSeverity: 1, sustainedTurns: 0 }],
    });
    const problems = validateCrisisDefinition(def).join("|");
    expect(problems).toMatch(/surge must be at least onset/);
    expect(problems).toMatch(/stage peak maxTurns/);
    expect(problems).toMatch(/duplicate lever id stimulus/);
    expect(problems).toMatch(/transmission/);
    expect(problems).toMatch(/recoveryTurns/);
    expect(problems).toMatch(/sustainedTurns/);
  });
});

describe("createCrisisInstance", () => {
  it("starts at signal with the definition's initial severity", () => {
    const def = makeDefinition();
    const inst = createCrisisInstance(def, 7);
    expect(inst).toMatchObject({
      definitionId: "test-crisis",
      stage: "signal",
      startTurn: 7,
      stageStartTurn: 7,
      severity: 20,
      peakSeverity: 20,
      idleTurns: 0,
      relapses: 0,
    });
    expect(inst.severityHistory).toEqual([{ turn: 7, severity: 20 }]);
    expect(JSON.parse(JSON.stringify(inst))).toEqual(inst);
  });
});
