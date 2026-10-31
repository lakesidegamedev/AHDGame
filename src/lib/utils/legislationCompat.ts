import type { LegislationType, LegislationEffectTargetV2, AllowedScope } from "@/lib/db/types";

/**
 * Get allowed scope from legacy or new field
 */
export function getAllowedScope(type: LegislationType): AllowedScope {
  if (type.allowedScope) return type.allowedScope;
  if (type.nationalOnly === true) return "national";
  if (type.nationalOnly === false) return "both";
  return "both";
}

/**
 * Get effect targets from legacy single or new array field
 */
export function getEffectTargets(type: LegislationType): LegislationEffectTargetV2[] {
  if (type.effectTargets?.length) return type.effectTargets;
  if (type.effectTarget) {
    return [
      {
        metricCategoryId: type.effectTarget.metricCategoryId,
        metricId: type.effectTarget.metricId,
        strength: "moderate",
      },
    ];
  }
  return [];
}
