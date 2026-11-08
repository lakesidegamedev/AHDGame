import type { Crisis, CrisisTemplate } from "@/lib/db/types/crisis";
import { ALL_CRISIS_TEMPLATES, getTemplateDuration } from "@/lib/crises/templates";
import { floorCrisisDuration } from "@/lib/crises/crisisDuration";
import { legacyStoredEffectsModule } from "@/lib/crises/v2/effectModule";
import {
  AD_HOC_TEMPLATE_KEY,
  convertLegacyTemplate,
  legacyDefinitionId,
} from "@/lib/crises/v2/legacyConvert";
import type { CrisisDefinition } from "@/lib/crises/v2/types";
import {
  getCrisisDefinition,
  registerCrisisDefinition,
  registerCrisisEffectModule,
} from "./registry";

let registered = false;

const AD_HOC_TEMPLATE = {
  name: "Crisis",
  scope: "country",
} as unknown as CrisisTemplate;

/** Default length a registered template definition reports, before a crisis overrides it. */
function defaultDuration(template: CrisisTemplate): number | null {
  const authored = getTemplateDuration(template, template.scope) ?? template.durationTurns ?? null;
  return template.chain ? authored : floorCrisisDuration(authored);
}

/**
 * Registers the effect module and one scripted definition per authored
 * template, plus the generic definition for templates built at runtime
 * (campaign events). Idempotent.
 */
export function ensureLegacyCrisisContent(): void {
  if (registered) return;
  registerCrisisEffectModule(legacyStoredEffectsModule);
  for (const [key, template] of Object.entries(ALL_CRISIS_TEMPLATES) as [
    string,
    CrisisTemplate,
  ][]) {
    registerCrisisDefinition(
      convertLegacyTemplate({ key, template, durationTurns: defaultDuration(template) })
    );
  }
  registerCrisisDefinition(
    convertLegacyTemplate({
      key: AD_HOC_TEMPLATE_KEY,
      template: AD_HOC_TEMPLATE,
      durationTurns: null,
    })
  );
  registered = true;
}

/** The definition a crisis created from this template key runs on. */
export function legacyDefinitionFor(templateKey: string | undefined): CrisisDefinition {
  ensureLegacyCrisisContent();
  const key =
    templateKey && getCrisisDefinition(legacyDefinitionId(templateKey))
      ? templateKey
      : AD_HOC_TEMPLATE_KEY;
  return getCrisisDefinition(legacyDefinitionId(key)) as CrisisDefinition;
}

export type LegacyDefinitionCrisis = Pick<Crisis, "templateKey">;

/** Test seam: forces the next ensure call to register again. */
export function resetLegacyCrisisContentForTests(): void {
  registered = false;
}
