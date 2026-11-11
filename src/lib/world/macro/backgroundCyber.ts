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
  launchCyberOperation,
  loadCyberCrisisTargets,
  loadCyberPairHistory,
  standDownCyber,
} from "@/lib/cyber/runCyberOperation";
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
  const tension = (await getColdWarTension(db)).value;
  const crisisTargets = await loadCyberCrisisTargets(
    db,
    candidates.map((p) => rivalLeaderOf(p.state.bloc, p.countryId)!)
  );
  let launched = 0;
  let standDowns = 0;
  for (const plan of candidates) {
    const targetId = rivalLeaderOf(plan.state.bloc, plan.countryId)!;
    const hawkish = plan.state.stance.hawkishness >= CYBER_SCRIPTED_HAWKISHNESS;
    const history = await loadCyberPairHistory(db, plan.countryId, targetId);
    // A dovish government with no history has nothing to decide.
    if (!hawkish && history.lastOperationTurn === null) continue;
    const [target] = await loadCyberResilience(db, [targetId]);
    const decision = planScriptedCyberOperation({
      attackerId: plan.countryId,
      hawkishness: plan.state.stance.hawkishness,
      rivalLeaderId: targetId,
      tension,
      history,
      targetResilience: target?.resilience ?? null,
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
