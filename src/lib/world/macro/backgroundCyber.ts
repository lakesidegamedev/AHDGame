/**
 * Kernel-tick shell for scripted cyber operations by background governments. The decision is
 * `planScriptedCyberOperation` (pure); this loads the tension reading, the rival's resilience
 * and the pair history only for hawkish governments, then launches or stands down through the
 * same shell a player's service uses.
 */
import { createHash } from "node:crypto";
import type { Db } from "mongodb";
import type { CountryId } from "@/lib/constants/countries";
import { getColdWarTension } from "@/lib/coldwar/tension";
import { CYBER_SCRIPTED_HAWKISHNESS, planScriptedCyberOperation } from "@/lib/cyber/operations";
import { loadCyberResilience } from "@/lib/cyber/resilience";
import {
  cyberPairKey,
  launchCyberOperation,
  loadCyberCrisisTargets,
  loadCyberPairHistories,
  standDownCyber,
} from "@/lib/cyber/runCyberOperation";
import { isLiveWorldSwitchOn } from "@/lib/gameConfig/liveWorldSwitches";
import { rivalLeaderOf } from "./rules/foreignPolicy";
import type { ForeignPolicyPlan } from "./backgroundForeignPolicy";

/** Deterministic roll in [0, 1) per country and turn, stable across a retried tick. */
export function scriptedRoll(countryId: string, turn: number): number {
  const hex = createHash("sha256").update(`cyber-script:${countryId}:${turn}`).digest("hex");
  return parseInt(hex.slice(0, 8), 16) / 0x100000000;
}

export async function applyScriptedCyber(
  db: Db,
  plans: readonly ForeignPolicyPlan[],
  turn: number
): Promise<{ launched: number; standDowns: number }> {
  const candidates = plans.filter((p) => rivalLeaderOf(p.state.bloc, p.countryId) !== null);
  if (candidates.length === 0) return { launched: 0, standDowns: 0 };
  if (!(await isLiveWorldSwitchOn(db, "cyberOperationsEnabled"))) {
    return { launched: 0, standDowns: 0 };
  }
  const tension = (await getColdWarTension(db)).value;
  const pairs = candidates.map((plan) => ({
    plan,
    attackerId: plan.countryId,
    targetId: rivalLeaderOf(plan.state.bloc, plan.countryId)!,
  }));
  const [crisisTargets, histories] = await Promise.all([
    loadCyberCrisisTargets(
      db,
      pairs.map((p) => p.targetId)
    ),
    loadCyberPairHistories(db, pairs),
  ]);
  // A dovish government with no history has nothing to decide.
  const deciding = pairs.flatMap((pair) => {
    const history = histories.get(cyberPairKey(pair.attackerId, pair.targetId))!;
    const hawkish = pair.plan.state.stance.hawkishness >= CYBER_SCRIPTED_HAWKISHNESS;
    return hawkish || history.lastOperationTurn !== null ? [{ ...pair, history }] : [];
  });
  if (deciding.length === 0) return { launched: 0, standDowns: 0 };
  const resilience = await loadCyberResilience(db, [...new Set(deciding.map((p) => p.targetId))]);
  const resilienceById = new Map(resilience.map((row) => [row.countryId, row.resilience]));
  let launched = 0;
  let standDowns = 0;
  // The launch shell re-reads the pair and the target, so a decision made on
  // this tick's snapshot cannot outrun an earlier launch in the same loop.
  for (const { plan, targetId, history } of deciding) {
    const decision = planScriptedCyberOperation({
      attackerId: plan.countryId,
      hawkishness: plan.state.stance.hawkishness,
      rivalLeaderId: targetId,
      tension,
      history,
      targetResilience: resilienceById.get(targetId) ?? null,
      turn,
      decisionRoll: scriptedRoll(plan.countryId, turn),
      targetCrisisActive: crisisTargets.has(targetId),
    });
    if (decision.kind === "launch") {
      const result = await launchCyberOperation({
        db,
        attackerId: plan.countryId as CountryId,
        targetId: decision.targetId as CountryId,
        turn,
        chargeAppropriation: false,
      });
      if (result.ok) launched++;
    } else if (decision.kind === "stand_down") {
      const result = await standDownCyber(
        db,
        plan.countryId as CountryId,
        decision.targetId as CountryId,
        turn
      );
      if (result.ok) standDowns++;
    }
  }
  return { launched, standDowns };
}
