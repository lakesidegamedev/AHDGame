/**
 * How long a spilled crisis runs and which authored effects it carries.
 *
 * A scripted (legacy template) definition takes its length from the crisis
 * document's `durationTurns` and its effects from the document's `effects`, so
 * a spilled copy that left both empty sat at peak for ever and did nothing.
 * Stage-driven definitions end through their own state machine and need neither.
 */
import type { CrisisEffect } from "@/lib/db/types/crisis";
import type { CrisisDefinition } from "./types";

/** Length given to a scripted definition that authors none. */
export const SPILLOVER_FALLBACK_DURATION_TURNS = 48;

export interface SpilloverShell {
  durationTurns: number | null;
  effects: CrisisEffect[];
}

export function spilloverShell(
  def: Pick<CrisisDefinition, "pacing">,
  templateEffects: readonly CrisisEffect[] | undefined
): SpilloverShell {
  if (def.pacing?.kind !== "scripted") return { durationTurns: null, effects: [] };
  return {
    durationTurns: def.pacing.durationTurns ?? SPILLOVER_FALLBACK_DURATION_TURNS,
    effects: templateEffects ? [...templateEffects] : [],
  };
}
