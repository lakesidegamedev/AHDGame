import { describe, expect, it } from "vitest";
import { evaluateEffectModules, createEffectRegistry, type EffectContext } from "./effectModule";
import type { EffectModuleRef } from "./types";
import { EMERGENT_CRISIS_DEFINITIONS } from "./definitions/emergent";
import { validateCrisisDefinition } from "./definition";
import { ROTDM_EFFECT_MODULES, crisisPressure } from "./rotdmModules";

function context(overrides: Partial<EffectContext> = {}): EffectContext {
  return {
    instance: { startTurn: 0, stage: "peak", stageStartTurn: 0 },
    severity: 80,
    stage: "peak",
    turn: 10,
    countryIds: ["US"],
    regionIds: [],
    ...overrides,
  };
}

const registry = createEffectRegistry(ROTDM_EFFECT_MODULES);

describe("rotdm effect modules", () => {
  it("scales with severity and stage and goes quiet when resolved", () => {
    expect(crisisPressure({ severity: 100, stage: "peak" })).toBe(1);
    expect(crisisPressure({ severity: 50, stage: "onset" })).toBeCloseTo(0.3);
    expect(crisisPressure({ severity: 100, stage: "resolved" })).toBe(0);
  });

  it("emits an intent for each system a definition aims at", () => {
    const refs: EffectModuleRef[] = [
      { moduleId: "rotdm.production", params: { maxCut: 0.1, sectorType: "energy" } },
      {
        moduleId: "rotdm.commodity",
        params: { commodity: "energy", maxSupplyCut: 0.1, maxDemandShift: -0.05 },
      },
      { moduleId: "rotdm.migration", params: { maxFraction: 0.01 } },
      { moduleId: "rotdm.bankStress", params: { max: 3 } },
      { moduleId: "rotdm.bondPressure", params: { maxBps: 100 } },
      { moduleId: "rotdm.approval", params: { max: 1, group: "workers" } },
      { moduleId: "rotdm.electionSwing", params: { maxPoints: 1 } },
    ];
    const { intents, missing } = evaluateEffectModules(refs, registry, context());
    expect(missing).toEqual([]);
    expect(intents.map((intent) => intent.kind)).toEqual([
      "plantCapacity",
      "commoditySupply",
      "commodityDemand",
      "migration",
      "bankStress",
      "bondYield",
      "approval",
      "electionSwing",
    ]);
    expect(intents[0]).toMatchObject({ sectorType: "energy" });
    expect((intents[0] as { factor: number }).factor).toBeCloseTo(-0.08);
    expect(intents[6]).toMatchObject({ group: "workers" });
    expect((intents[6] as { delta: number }).delta).toBeCloseTo(-0.8);
  });

  it("spreads migration across the crisis's regions", () => {
    const { intents } = evaluateEffectModules(
      [{ moduleId: "rotdm.migration", params: { maxFraction: 0.01 } }],
      registry,
      context({ regionIds: ["a", "b"] })
    );
    expect(intents).toMatchObject([
      { kind: "migration", fromRegionId: "a" },
      { kind: "migration", fromRegionId: "b" },
    ]);
  });

  it("emits nothing at low severity in the signal stage", () => {
    const { intents } = evaluateEffectModules(
      [{ moduleId: "rotdm.bondPressure", params: { maxBps: 100 } }],
      registry,
      context({ severity: 1, stage: "signal" })
    );
    expect(intents).toEqual([]);
  });
});

describe("emergent definitions", () => {
  it.each(EMERGENT_CRISIS_DEFINITIONS.map((def) => [def.id, def] as const))(
    "%s validates and only uses registered modules",
    (_id, def) => {
      expect(validateCrisisDefinition(def)).toEqual([]);
      for (const ref of def.effectModules) expect(registry.has(ref.moduleId)).toBe(true);
      expect(def.source).toBe("emergent");
      expect(new Set(def.levers.map((lever) => lever.role)).size).toBeGreaterThanOrEqual(3);
    }
  );

  it("has unique ids and no dashes in player-facing labels", () => {
    const ids = EMERGENT_CRISIS_DEFINITIONS.map((def) => def.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const def of EMERGENT_CRISIS_DEFINITIONS) {
      for (const text of [def.label, ...def.levers.map((lever) => lever.label)]) {
        expect(text).not.toMatch(/[\u2013\u2014]/);
      }
    }
  });
});
