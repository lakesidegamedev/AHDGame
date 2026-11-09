/** Game health distinguishes executed failures from work blocked by an earlier failure. */
import type { TurnPhaseTelemetryMap } from "@/lib/db/types";

export function gameHealthPhaseCounts(snapshot: {
  turnProcessing?: { errorCount?: number; phaseStatuses?: TurnPhaseTelemetryMap };
}): { errors: number; blocked: number } {
  const statuses = Object.values(snapshot.turnProcessing?.phaseStatuses ?? {});
  const legacyErrors = snapshot.turnProcessing?.errorCount ?? 0;
  return {
    errors:
      statuses.length > 0
        ? statuses.filter((s) => s.status === "failed").length
        : Number.isFinite(legacyErrors) && legacyErrors > 0
          ? Math.floor(legacyErrors)
          : 0,
    blocked: statuses.filter((s) => s.status === "notReached").length,
  };
}
