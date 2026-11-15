import type { CrisisDefinition, CrisisInstance, CrisisStage } from "./types";

export type TransitionReason = "hold" | "threshold" | "surge" | "contained" | "expired" | "relapse";

export interface StageTransition {
  stage: CrisisStage;
  changed: boolean;
  reason: TransitionReason;
}

type StageInstance = Pick<CrisisInstance, "stage" | "stageStartTurn" | "relapses">;

function hold(stage: CrisisStage): StageTransition {
  return { stage, changed: false, reason: "hold" };
}

function move(stage: CrisisStage, reason: TransitionReason): StageTransition {
  return { stage, changed: true, reason };
}

/**
 * The next stage for an instance this turn. At most one step per call, so a
 * shock cannot skip from signal to peak without the stages being observed.
 * Severity decides, bounded by each stage's min and max turns.
 */
export function nextStage(
  instance: StageInstance,
  def: CrisisDefinition,
  severity: number,
  turn: number
): StageTransition {
  const { stage } = instance;
  if (stage === "resolved") return hold(stage);

  const th = def.thresholds;
  const rule = def.stages[stage];
  const inStage = turn - instance.stageStartTurn;
  const minMet = inStage >= rule.minTurns;
  const surging = th.surge !== undefined && severity >= th.surge;
  const canAdvance = minMet || surging;
  const expired = rule.maxTurns !== null && inStage >= rule.maxTurns;
  const advanceReason: TransitionReason = minMet ? "threshold" : "surge";

  switch (stage) {
    case "signal":
      if (minMet && severity <= th.resolve) return move("resolved", "contained");
      if (canAdvance && severity >= th.onset) return move("onset", advanceReason);
      if (expired) return move("resolved", "expired");
      return hold(stage);
    case "onset":
      if (minMet && severity <= th.resolve) return move("aftermath", "contained");
      if (canAdvance && severity >= th.peak) return move("peak", advanceReason);
      if (expired) return move("aftermath", "expired");
      return hold(stage);
    case "peak":
      if (minMet && severity <= th.easing) return move("aftermath", "threshold");
      if (expired) return move("aftermath", "expired");
      return hold(stage);
    case "aftermath":
      if ((def.maxRelapses ?? 0) > instance.relapses && severity >= th.peak) {
        return move("peak", "relapse");
      }
      if (minMet && severity <= th.resolve) return move("resolved", "threshold");
      if (expired) return move("resolved", "expired");
      return hold(stage);
  }
}

/** Applies a transition to an instance, returning a new instance. */
export function applyTransition(
  instance: CrisisInstance,
  transition: StageTransition,
  turn: number
): CrisisInstance {
  if (!transition.changed) return instance;
  return {
    ...instance,
    stage: transition.stage,
    stageStartTurn: turn,
    relapses: transition.reason === "relapse" ? instance.relapses + 1 : instance.relapses,
  };
}

/** Turns spent in the current stage. */
export function turnsInStage(
  instance: Pick<CrisisInstance, "stageStartTurn">,
  turn: number
): number {
  return Math.max(0, turn - instance.stageStartTurn);
}
