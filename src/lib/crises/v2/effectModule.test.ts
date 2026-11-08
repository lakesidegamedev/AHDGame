import { describe, expect, it } from "vitest";
import type { CrisisEffect } from "@/lib/db/types/crisis";
import {
  createEffectRegistry,
  createLegacyEffectModule,
  evaluateEffectModules,
  legacyTickRamp,
  type EffectContext,
  type EffectModule,
} from "./effectModule";

function fx(overrides: Partial<CrisisEffect>): CrisisEffect {
  return {
    effectType: "flat",
    targetType: "metric",
    metricCategory: "economic",
    metricField: "gdpGrowth",
    sectorType: null,
    strategyId: null,
    value: -2,
    label: "x",
    ...overrides,
  };
}

function ctx(turn: number, extra: Partial<EffectContext> = {}): EffectContext {
  return {
    instance: { startTurn: 10, stage: "onset", stageStartTurn: 10 },
    severity: 50,
    stage: "onset",
    turn,
    countryIds: ["c1"],
    regionIds: ["r1"],
    ...extra,
  };
}

describe("legacyTickRamp", () => {
  it("ramps linearly from 1 to 0 over the duration", () => {
    expect(legacyTickRamp(10, 10, 20)).toBe(1);
    expect(legacyTickRamp(20, 10, 20)).toBe(0.5);
    expect(legacyTickRamp(40, 10, 20)).toBe(0);
  });
  it("does not ramp without a duration", () => {
    expect(legacyTickRamp(99, 10, null)).toBe(1);
  });
});

describe("createLegacyEffectModule", () => {
  const legacy = createLegacyEffectModule(
    "legacy",
    [
      fx({ effectType: "flat", value: -3 }),
      fx({
        effectType: "tick",
        targetType: "approval",
        metricCategory: null,
        metricField: null,
        value: -0.5,
      }),
      fx({
        effectType: "decay",
        targetType: "inflation",
        metricCategory: null,
        metricField: null,
        value: 2,
      }),
    ],
    { durationTurns: 20 }
  );

  it("applies flat effects once, on the start turn only", () => {
    const first = legacy.evaluate(ctx(10), {});
    expect(first).toContainEqual({
      kind: "metric",
      category: "economic",
      field: "gdpGrowth",
      delta: -3,
    });
    const later = legacy.evaluate(ctx(11), {});
    expect(later.some((i) => i.kind === "metric")).toBe(false);
  });

  it("applies tick effects every turn with the old ramp", () => {
    expect(legacy.evaluate(ctx(10), {})).toContainEqual({ kind: "approval", delta: -0.5 });
    expect(legacy.evaluate(ctx(20), {})).toContainEqual({ kind: "approval", delta: -0.25 });
  });

  it("halves decay effects each turn", () => {
    expect(legacy.evaluate(ctx(10), {})).toContainEqual({ kind: "inflation", delta: 2 });
    expect(legacy.evaluate(ctx(12), {})).toContainEqual({ kind: "inflation", delta: 0.5 });
  });

  it("emits nothing before the start turn", () => {
    expect(legacy.evaluate(ctx(9), {})).toEqual([]);
  });

  it("maps every legacy target type", () => {
    const all = createLegacyEffectModule(
      "all",
      [
        fx({ targetType: "gdpLoss", value: 0.03 }),
        fx({
          targetType: "profitMargin",
          sectorType: "energy",
          value: -10,
          physicality: "physical",
        }),
        fx({ targetType: "stat", statKey: "charisma", value: -1 }),
        fx({ targetType: "metric", metricCategory: null, metricField: null }),
        fx({ targetType: "stat", statKey: undefined }),
      ],
      { durationTurns: null }
    );
    expect(all.evaluate(ctx(10), {})).toEqual([
      { kind: "gdpLoss", fraction: 0.03 },
      { kind: "profitMargin", sectorType: "energy", points: -10, physical: true },
      { kind: "stat", statKey: "charisma", delta: -1 },
    ]);
  });

  it("scales by severity when asked", () => {
    const scaled = createLegacyEffectModule("s", [fx({ value: -4 })], {
      durationTurns: null,
      scaling: "severity",
      referenceSeverity: 50,
    });
    expect(scaled.evaluate(ctx(10, { severity: 25 }), {})[0]).toMatchObject({ delta: -2 });
    expect(scaled.evaluate(ctx(10, { severity: 500 }), {})[0]).toMatchObject({ delta: -8 });
  });
});

describe("effect registry", () => {
  const bankStress: EffectModule = {
    id: "bank",
    evaluate: (c, params) => [
      { kind: "bankStress", delta: (c.severity / 100) * Number(params.weight ?? 1) },
    ],
  };

  it("evaluates referenced modules with their params", () => {
    const registry = createEffectRegistry([bankStress]);
    const out = evaluateEffectModules(
      [{ moduleId: "bank", params: { weight: 2 } }],
      registry,
      ctx(10)
    );
    expect(out.intents).toEqual([{ kind: "bankStress", delta: 1 }]);
    expect(out.missing).toEqual([]);
  });

  it("reports unknown modules without throwing", () => {
    const out = evaluateEffectModules([{ moduleId: "ghost" }], createEffectRegistry([]), ctx(10));
    expect(out).toEqual({ intents: [], missing: ["ghost"] });
  });

  it("emits nothing once resolved", () => {
    const registry = createEffectRegistry([bankStress]);
    const out = evaluateEffectModules(
      [{ moduleId: "bank" }],
      registry,
      ctx(10, { stage: "resolved" })
    );
    expect(out.intents).toEqual([]);
  });

  it("rejects duplicate module ids", () => {
    expect(() => createEffectRegistry([bankStress, bankStress])).toThrow(/duplicate/);
  });
});
