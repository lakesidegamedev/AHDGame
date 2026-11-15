import { describe, expect, it } from "vitest";
import { makeDefinition } from "./testFixtures";
import { createCrisisInstance } from "./instance";
import {
  SEVERITY_HISTORY_LIMIT,
  acceptLeverUses,
  applySeverityStep,
  computeSeverityStep,
  forecastInaction,
} from "./severity";
import type { CrisisInstance } from "./types";

const def = makeDefinition();

function inst(extra: Partial<CrisisInstance> = {}): CrisisInstance {
  return { ...createCrisisInstance(def, 0), stage: "onset", severity: 40, ...extra };
}

describe("computeSeverityStep", () => {
  it("adds driver terms scaled by their coefficients", () => {
    const step = computeSeverityStep(inst(), def, {
      turn: 1,
      driverInputs: { unemployment: 0.5, relief: 1 },
      leverUses: [{ leverId: "rate-cut", holderId: "a" }],
    });
    expect(step.driverTerms).toEqual({ unemployment: 5, relief: -4 });
    expect(step.driverTotal).toBe(1);
    expect(step.after).toBe(40 + 1 - 8);
  });

  it("treats a missing input as zero", () => {
    const step = computeSeverityStep(inst({ idleTurns: 0 }), def, {
      turn: 1,
      driverInputs: {},
      leverUses: [{ leverId: "rate-cut", holderId: "a" }],
    });
    expect(step.driverTotal).toBe(0);
  });

  it("clamps to 0..100", () => {
    const high = computeSeverityStep(inst({ severity: 99 }), def, {
      turn: 1,
      driverInputs: { unemployment: 5 },
      leverUses: [],
    });
    expect(high.after).toBe(100);
    const low = computeSeverityStep(inst({ severity: 2 }), def, {
      turn: 1,
      driverInputs: {},
      leverUses: [{ leverId: "rate-cut", holderId: "a" }],
    });
    expect(low.after).toBe(0);
  });

  it("caps combined mitigation and shares the cap proportionally", () => {
    const accepted = acceptLeverUses(
      inst(),
      def,
      [
        { leverId: "rate-cut", holderId: "a" },
        { leverId: "relief-bill", holderId: "b" },
      ],
      1
    );
    const total = accepted.reduce((sum, a) => sum + a.mitigation, 0);
    expect(total).toBeCloseTo(12);
    expect(accepted[0].mitigation / accepted[1].mitigation).toBeCloseTo(8 / 10);
  });

  it("scales a lever by intensity and clamps intensity", () => {
    const accepted = acceptLeverUses(
      inst(),
      def,
      [
        { leverId: "rate-cut", holderId: "a", intensity: 0.5 },
        { leverId: "stimulus", holderId: "b", intensity: 7 },
      ],
      1
    );
    expect(accepted.map((a) => a.mitigation)).toEqual([4, 6]);
  });

  it("ignores unknown levers, wrong-stage levers and duplicate uses", () => {
    const accepted = acceptLeverUses(
      inst({ stage: "aftermath" }),
      def,
      [
        { leverId: "nope", holderId: "a" },
        { leverId: "relief-bill", holderId: "a" },
        { leverId: "rate-cut", holderId: "a" },
        { leverId: "rate-cut", holderId: "a" },
      ],
      1
    );
    expect(accepted.map((a) => a.lever.id)).toEqual(["rate-cut"]);
  });

  it("enforces per-holder cooldowns", () => {
    const used = inst({ leverLastUsed: { "stimulus:a": 5 } });
    const ids = (turn: number, holder: string) =>
      acceptLeverUses(used, def, [{ leverId: "stimulus", holderId: holder }], turn).length;
    expect(ids(6, "a")).toBe(0);
    expect(ids(7, "a")).toBe(0);
    expect(ids(8, "a")).toBe(1);
    expect(ids(6, "b")).toBe(1);
  });

  it("returns nothing for a resolved instance", () => {
    expect(
      acceptLeverUses(inst({ stage: "resolved" }), def, [{ leverId: "rate-cut", holderId: "a" }], 1)
    ).toEqual([]);
  });
});

describe("inaction escalation", () => {
  it("waits out the grace period, then grows to the ceiling", () => {
    let state = inst({ severity: 10, idleTurns: 0 });
    const added: number[] = [];
    for (let turn = 1; turn <= 7; turn++) {
      const step = computeSeverityStep(state, def, { turn, driverInputs: {}, leverUses: [] });
      added.push(step.escalation);
      state = { ...state, severity: step.after, idleTurns: step.idleTurns };
    }
    expect(added).toEqual([0, 2, 3, 4, 5, 5, 5]);
  });

  it("resets when someone acts", () => {
    const step = computeSeverityStep(inst({ idleTurns: 6 }), def, {
      turn: 1,
      driverInputs: {},
      leverUses: [{ leverId: "rate-cut", holderId: "a" }],
    });
    expect(step.idleTurns).toBe(0);
    expect(step.escalation).toBe(0);
  });

  it("does not count a token move under the acting threshold", () => {
    const strict = makeDefinition({
      severity: { ...def.severity, actingThreshold: 5 },
    });
    const step = computeSeverityStep(inst({ idleTurns: 3 }), strict, {
      turn: 1,
      driverInputs: {},
      leverUses: [{ leverId: "rate-cut", holderId: "a", intensity: 0.25 }],
    });
    expect(step.idleTurns).toBe(4);
    expect(step.escalation).toBeGreaterThan(0);
  });

  it("does not escalate in the aftermath, which decays instead", () => {
    const step = computeSeverityStep(inst({ stage: "aftermath", idleTurns: 9 }), def, {
      turn: 1,
      driverInputs: {},
      leverUses: [],
    });
    expect(step.escalation).toBe(0);
    expect(step.decay).toBe(3);
    expect(step.after).toBe(37);
  });
});

describe("applySeverityStep", () => {
  it("records history, peak and lever use without changing the stage", () => {
    const start = inst();
    const step = computeSeverityStep(start, def, {
      turn: 3,
      driverInputs: { unemployment: 3 },
      leverUses: [{ leverId: "stimulus", holderId: "gov" }],
    });
    const next = applySeverityStep(start, step, 3);
    expect(next.severity).toBe(step.after);
    expect(next.peakSeverity).toBe(Math.max(start.peakSeverity, step.after));
    expect(next.severityHistory.at(-1)).toEqual({ turn: 3, severity: step.after });
    expect(next.leverLastUsed["stimulus:gov"]).toBe(3);
    expect(next.stage).toBe("onset");
    expect(start.severityHistory).toHaveLength(1);
  });

  it("keeps the history bounded", () => {
    let state = inst();
    for (let turn = 1; turn <= SEVERITY_HISTORY_LIMIT + 10; turn++) {
      const step = computeSeverityStep(state, def, { turn, driverInputs: {}, leverUses: [] });
      state = applySeverityStep(state, step, turn);
    }
    expect(state.severityHistory).toHaveLength(SEVERITY_HISTORY_LIMIT);
    expect(state.severityHistory.at(-1)?.turn).toBe(SEVERITY_HISTORY_LIMIT + 10);
  });
});

describe("forecastInaction", () => {
  it("projects a rising path when nobody acts and leaves the instance untouched", () => {
    const state = inst({ severity: 30 });
    const path = forecastInaction(state, def, { unemployment: 0.2 }, 0, 5);
    expect(path).toHaveLength(5);
    expect(path).toEqual([...path].sort((a, b) => a - b));
    expect(path[4]).toBeGreaterThan(path[0]);
    expect(state.idleTurns).toBe(0);
  });
});
