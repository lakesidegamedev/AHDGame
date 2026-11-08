import { leverKey } from "@/lib/crises/v2/severity";
import type {
  CrisisInstance,
  CrisisLeverDef,
  CrisisStage,
  ActiveCrisisStage,
} from "@/lib/crises/v2/types";

export type LeverBlock = "resolved" | "wrongStage" | "cooldown";

/**
 * Why a lever cannot be pulled right now, or null when it can. `lastPulled` is
 * the latest turn this holder pulled the lever, whether or not the turn phase
 * has counted it yet.
 */
export function leverBlock(
  instance: Pick<CrisisInstance, "stage" | "leverLastUsed">,
  lever: CrisisLeverDef,
  holderId: string,
  turn: number,
  lastPulled: number | undefined
): LeverBlock | null {
  const stage: CrisisStage = instance.stage;
  if (stage === "resolved") return "resolved";
  if (lever.stages && !lever.stages.includes(stage as ActiveCrisisStage)) return "wrongStage";
  const counted = instance.leverLastUsed[leverKey(lever.id, holderId)];
  const last = Math.max(counted ?? -Infinity, lastPulled ?? -Infinity);
  if (Number.isFinite(last) && turn - last <= (lever.cooldownTurns ?? 0)) return "cooldown";
  return null;
}
