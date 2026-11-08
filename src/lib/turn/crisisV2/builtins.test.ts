import { beforeEach, describe, expect, it } from "vitest";
import { validateCrisisDefinition } from "@/lib/crises/v2/definition";
import { ensureBuiltinCrisisV2Content } from "./builtins";
import { DETECTOR_SOURCES } from "./detectors";
import {
  getCrisisDefinition,
  getCrisisEffectRegistry,
  getCrisisInputProvider,
  listCrisisOpenCandidateProviders,
  resetCrisisV2RegistryForTests,
} from "./registry";

describe("ensureBuiltinCrisisV2Content", () => {
  beforeEach(() => resetCrisisV2RegistryForTests());

  it("registers modules, definitions, detectors and every input a definition drives from", () => {
    ensureBuiltinCrisisV2Content();
    ensureBuiltinCrisisV2Content();

    expect(listCrisisOpenCandidateProviders()).toHaveLength(DETECTOR_SOURCES.length);
    const registry = getCrisisEffectRegistry();
    for (const source of DETECTOR_SOURCES) {
      const def = getCrisisDefinition(source.spec.definitionId);
      expect(def, source.spec.definitionId).toBeDefined();
      expect(validateCrisisDefinition(def!)).toEqual([]);
      for (const ref of def!.effectModules) expect(registry.has(ref.moduleId)).toBe(true);
      for (const driver of def!.severity.drivers) {
        expect(getCrisisInputProvider(driver.input), driver.input).toBeDefined();
      }
    }
  });
});
