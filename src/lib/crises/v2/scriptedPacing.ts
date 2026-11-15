import {
  clampSeverity,
  type ActiveCrisisStage,
  type CrisisInstance,
  type CrisisStage,
  type StageRule,
} from "./types";

/** Severity a scripted crisis holds while nobody pulls a lever. */
export const SCRIPTED_REFERENCE_SEVERITY = 60;

/**
 * Stage boundaries, in turns since the crisis started, for a crisis scheduled
 * to run `duration` turns: signal on the start turn, onset to 20%, peak to 60%,
 * aftermath to the end. Short crises collapse stages rather than skip the end.
 */
export function scriptedStageBounds(duration: number): [number, number, number, number] {
  const length = Math.max(1, Math.floor(duration));
  const onsetEnd = Math.min(length, Math.max(2, Math.round(length * 0.2)));
  const peakEnd = Math.min(length, Math.max(onsetEnd, Math.round(length * 0.6)));
  return [Math.min(1, length), onsetEnd, peakEnd, length];
}

/** Stage for a scripted crisis `elapsed` turns in. Null duration never leaves peak. */
export function scriptedStageAt(elapsed: number, duration: number | null): CrisisStage {
  if (duration === null) return elapsed < 1 ? "signal" : elapsed < 2 ? "onset" : "peak";
  const [signalEnd, onsetEnd, peakEnd, end] = scriptedStageBounds(duration);
  if (elapsed >= end) return "resolved";
  if (elapsed < signalEnd) return "signal";
  if (elapsed < onsetEnd) return "onset";
  if (elapsed < peakEnd) return "peak";
  return "aftermath";
}

/** Stage rules that describe the same walk, for display and validation. */
export function scriptedStageRules(duration: number | null): Record<ActiveCrisisStage, StageRule> {
  if (duration === null) {
    return {
      signal: { minTurns: 1, maxTurns: 1 },
      onset: { minTurns: 1, maxTurns: 1 },
      peak: { minTurns: 1, maxTurns: null },
      aftermath: { minTurns: 1, maxTurns: null },
    };
  }
  const [signalEnd, onsetEnd, peakEnd, end] = scriptedStageBounds(duration);
  const rule = (turns: number): StageRule => ({ minTurns: turns, maxTurns: turns });
  return {
    signal: rule(signalEnd),
    onset: rule(onsetEnd - signalEnd),
    peak: rule(peakEnd - onsetEnd),
    aftermath: rule(end - peakEnd),
  };
}

/**
 * Pins severity to a value another system owns. The sample for this turn is
 * replaced rather than appended, so the history stays one point per turn.
 */
export function applyTrackedSeverity(instance: CrisisInstance, value: number): CrisisInstance {
  const severity = clampSeverity(value);
  const history = instance.severityHistory.slice();
  const last = history.at(-1);
  if (last) history[history.length - 1] = { ...last, severity };
  return {
    ...instance,
    severity,
    peakSeverity: Math.max(instance.peakSeverity, severity),
    severityHistory: history,
  };
}
