import { EMERGENT_CRISIS_DEFINITIONS } from "@/lib/crises/v2/definitions/emergent";
import { ROTDM_EFFECT_MODULES } from "@/lib/crises/v2/rotdmModules";
import { createDetectorProvider, DETECTOR_SOURCES } from "./detectors";
import { ensureBuiltinCrisisInputProviders } from "./inputProviders";
import {
  getCrisisDefinition,
  getCrisisEffectRegistry,
  listCrisisOpenCandidateProviders,
  registerCrisisDefinition,
  registerCrisisEffectModule,
  registerCrisisOpenCandidateProvider,
} from "./registry";

/**
 * Registers the built-in effect modules, emergent definitions, input providers
 * and detectors that are not already registered. Safe to call every turn.
 */
export function ensureBuiltinCrisisV2Content(): void {
  ensureBuiltinCrisisInputProviders();

  const registeredModules = getCrisisEffectRegistry();
  for (const mod of ROTDM_EFFECT_MODULES) {
    if (!registeredModules.has(mod.id)) registerCrisisEffectModule(mod);
  }
  for (const def of EMERGENT_CRISIS_DEFINITIONS) {
    if (!getCrisisDefinition(def.id)) registerCrisisDefinition(def);
  }
  const registeredDetectors = new Set(listCrisisOpenCandidateProviders().map((p) => p.id));
  for (const source of DETECTOR_SOURCES) {
    if (!registeredDetectors.has(source.spec.id)) {
      registerCrisisOpenCandidateProvider(createDetectorProvider(source));
    }
  }
}
