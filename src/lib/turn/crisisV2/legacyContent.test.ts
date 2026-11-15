import { beforeEach, describe, expect, it } from "vitest";
import { floorCrisisDuration } from "@/lib/crises/crisisDuration";
import { ALL_CRISIS_TEMPLATES, getTemplateDuration } from "@/lib/crises/templates";
import { validateCrisisDefinition } from "@/lib/crises/v2/definition";
import {
  LEGACY_STORED_EFFECTS_MODULE_ID,
  evaluateEffectModules,
  legacyEffectsForTurn,
  legacyEffectsToIntents,
} from "@/lib/crises/v2/effectModule";
import { createCrisisInstance } from "@/lib/crises/v2/instance";
import { legacyDefinitionId, AD_HOC_TEMPLATE_KEY } from "@/lib/crises/v2/legacyConvert";
import type { CrisisTemplate } from "@/lib/db/types/crisis";
import { tickDecayFactor } from "@/lib/turn/crisisTurn";
import {
  ensureLegacyCrisisContent,
  legacyDefinitionFor,
  resetLegacyCrisisContentForTests,
} from "./legacyContent";
import {
  getCrisisDefinition,
  getCrisisEffectRegistry,
  resetCrisisV2RegistryForTests,
} from "./registry";

const templates = Object.entries(ALL_CRISIS_TEMPLATES) as [string, CrisisTemplate][];

/** What the old turn loop applied on a turn, written out independently of the adapter. */
function oldEngineEffects(template: CrisisTemplate, duration: number | null, elapsed: number) {
  const scale = tickDecayFactor(elapsed, 0, duration);
  return template.effects
    .filter((e) => e.effectType === "tick" || (e.effectType === "flat" && elapsed === 0))
    .map((e) => (e.effectType === "tick" ? { ...e, value: e.value * scale } : e))
    .filter((e) => e.value !== 0);
}

describe("legacy template conversion", () => {
  beforeEach(() => {
    resetCrisisV2RegistryForTests();
    resetLegacyCrisisContentForTests();
    ensureLegacyCrisisContent();
  });

  it("registers a definition for every authored template", () => {
    expect(templates.length).toBeGreaterThan(50);
    for (const [key] of templates) {
      expect(getCrisisDefinition(legacyDefinitionId(key)), key).toBeDefined();
    }
    expect(getCrisisDefinition(legacyDefinitionId(AD_HOC_TEMPLATE_KEY))).toBeDefined();
  });

  it("produces valid scripted definitions", () => {
    for (const [key] of templates) {
      const def = getCrisisDefinition(legacyDefinitionId(key))!;
      expect(validateCrisisDefinition(def), key).toEqual([]);
      expect(def.source).toBe("scripted");
      expect(def.pacing?.kind).toBe("scripted");
    }
  });

  it("applies the same effects, at the same size, as the old engine on every turn", () => {
    for (const [key, template] of templates) {
      const authored =
        getTemplateDuration(template, template.scope) ?? template.durationTurns ?? null;
      const duration = template.chain ? authored : floorCrisisDuration(authored);
      const turns = duration === null ? 30 : duration + 2;
      for (let elapsed = 0; elapsed < turns; elapsed++) {
        const got = legacyEffectsForTurn(template.effects, {
          turn: elapsed,
          startTurn: 0,
          durationTurns: duration,
        });
        expect(got, `${key} @${elapsed}`).toEqual(oldEngineEffects(template, duration, elapsed));
      }
    }
  });

  it("never applies decay effects per turn", () => {
    const withDecay = templates.filter(([, t]) => t.effects.some((e) => e.effectType === "decay"));
    expect(withDecay.length).toBeGreaterThan(0);
    for (const [, template] of withDecay) {
      for (let elapsed = 0; elapsed < 6; elapsed++) {
        const got = legacyEffectsForTurn(template.effects, {
          turn: elapsed,
          startTurn: 0,
          durationTurns: 24,
        });
        expect(got.some((e) => e.effectType === "decay")).toBe(false);
      }
    }
  });

  it("emits the stored effects through the registered module", () => {
    const [, template] = templates.find(([key]) => key === "banking_crisis")!;
    const def = legacyDefinitionFor("banking_crisis");
    const instance = createCrisisInstance(def, 0, { evaluateOnStart: true });
    const ctx = {
      instance,
      severity: instance.severity,
      stage: instance.stage,
      turn: 4,
      countryIds: ["US"],
      regionIds: [],
      storedEffects: template.effects,
      durationTurns: 24,
    };
    const evaluation = evaluateEffectModules(def.effectModules, getCrisisEffectRegistry(), ctx);
    expect(evaluation.missing).toEqual([]);
    expect(evaluation.intents).toEqual(
      legacyEffectsToIntents(
        legacyEffectsForTurn(template.effects, { turn: 4, startTurn: 0, durationTurns: 24 })
      )
    );
    expect(def.effectModules[0].moduleId).toBe(LEGACY_STORED_EFFECTS_MODULE_ID);
  });

  it("scales the module down as levers ease severity, never up", () => {
    const def = legacyDefinitionFor("banking_crisis");
    const [, template] = templates.find(([key]) => key === "banking_crisis")!;
    const instance = createCrisisInstance(def, 0);
    const base = {
      instance,
      stage: instance.stage,
      turn: 1,
      countryIds: ["US"],
      regionIds: [],
      storedEffects: template.effects,
      durationTurns: 24,
    };
    const registry = getCrisisEffectRegistry();
    const full = evaluateEffectModules(def.effectModules, registry, { ...base, severity: 60 });
    const eased = evaluateEffectModules(def.effectModules, registry, { ...base, severity: 30 });
    const over = evaluateEffectModules(def.effectModules, registry, { ...base, severity: 100 });
    expect(over.intents).toEqual(full.intents);
    expect(JSON.stringify(eased.intents)).not.toBe(JSON.stringify(full.intents));
  });

  it("turns decision options into levers held by the asked office", () => {
    const def = legacyDefinitionFor("banking_crisis");
    expect(def.levers.length).toBeGreaterThan(0);
    expect(def.levers.every((lever) => lever.role === "headOfState")).toBe(true);
    expect(def.levers.map((l) => l.id)).toContain("bailout.bailout_yes");
    expect(def.levers.map((l) => l.id)).not.toContain("oversight.oversight_strict");
  });

  it("falls back to the generic definition for templates built at runtime", () => {
    expect(legacyDefinitionFor(undefined).id).toBe(legacyDefinitionId(AD_HOC_TEMPLATE_KEY));
    expect(legacyDefinitionFor("not_a_template").id).toBe(legacyDefinitionId(AD_HOC_TEMPLATE_KEY));
  });
});
