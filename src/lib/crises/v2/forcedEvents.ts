import type {
  CrisisDefinition,
  CrisisInstance,
  ForcedEventProgress,
  ForcedEventThreshold,
} from "./types";
import { isActiveStage } from "./types";

export const EMPTY_FORCED_PROGRESS: ForcedEventProgress = { streaks: {}, fired: [] };

/**
 * Advances every forced-event threshold one turn. A threshold counts a turn when
 * severity is at or above its floor in a stage it listens to, and loses its run
 * otherwise. It fires the turn the run reaches `sustainedTurns`, once per crisis.
 */
export function stepForcedEvents(
  def: Pick<CrisisDefinition, "forcedEvents">,
  instance: Pick<CrisisInstance, "stage" | "severity" | "forced">
): { progress: ForcedEventProgress; fired: ForcedEventThreshold[] } {
  const prior = instance.forced ?? EMPTY_FORCED_PROGRESS;
  const streaks: Record<string, number> = {};
  const fired: ForcedEventThreshold[] = [];
  const firedIds = new Set(prior.fired);
  const stage = instance.stage;

  for (const threshold of def.forcedEvents) {
    if (firedIds.has(threshold.id)) continue;
    const listening =
      isActiveStage(stage) && (!threshold.stages || threshold.stages.includes(stage));
    const qualifies = listening && instance.severity >= threshold.minSeverity;
    if (!qualifies) continue;
    const count = (prior.streaks[threshold.id] ?? 0) + 1;
    if (count >= threshold.sustainedTurns) {
      fired.push(threshold);
      firedIds.add(threshold.id);
    } else {
      streaks[threshold.id] = count;
    }
  }
  return { progress: { streaks, fired: [...firedIds] }, fired };
}

/** Approval points a state of emergency costs the government each turn it lasts. */
export const EMERGENCY_APPROVAL_DRIFT = -0.2;
