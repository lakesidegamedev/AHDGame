import type { Crisis } from "@/lib/db/types/crisis";

export function isConflictBulletin(
  crisis: Pick<Crisis, "livingConflictEventId" | "effects" | "interactionDefinition" | "v2Output">
): boolean {
  return Boolean(
    crisis.livingConflictEventId &&
    !crisis.interactionDefinition &&
    crisis.effects.length === 0 &&
    !crisis.v2Output?.productionCuts?.length
  );
}
