/**
 * Frontier programmes (issue #5705): repeatable research after the last
 * authored tier, so R&D always has a use.
 *
 * Once a corporation owns every baseline node (slots 1 to 9) of the last
 * tier in the lane it committed to, it may buy frontier programmes for its
 * sector. Each purchase is one of two kinds: an output programme (+0.4% plant
 * output) or an input programme (-0.6% plant inputs). Each costs 15% more
 * rdScore than the one before, counted over both kinds, and the effects pass
 * through the same aggregate caps as every node (TECH_PLANT_OUTPUT_CAP,
 * TECH_INPUT_EFFICIENCY_CAP), so stacking can never run away.
 *
 * Programme effects apply to the corporation's primary sector, at full
 * strength, and never expire with a decade.
 *
 * Plain data in, plain data out.
 */
import { TECH_DECADES, isDecadeReached } from "./decades";
import { DECADE_COST, TECH_TREE, type TechLane } from "./nodes";
import type { TechEffect } from "./effects";
import type { OperatingSectorType } from "../corporations";

export type FrontierProgrammeKind = "output" | "input";

export const FRONTIER_PROGRAMME_KINDS: readonly FrontierProgrammeKind[] = ["output", "input"];

/** Purchases made so far, by kind. Persisted on the corporation. */
export interface FrontierProgrammeCounts {
  output?: number;
  input?: number;
}

/** Plant output added by each output programme. */
export const FRONTIER_OUTPUT_PCT = 0.004;
/** Plant input use removed by each input programme. */
export const FRONTIER_INPUT_PCT = 0.006;
/** Each programme costs this much more than the previous one (compounding). */
export const FRONTIER_COST_GROWTH = 0.15;
/**
 * rdScore of the first programme: twice the last tier's node cost, the price
 * of a specialization entry in that tier, so the lane continues where the
 * authored tree ends.
 */
export const FRONTIER_BASE_COST_MULT = 2;

/** The last authored tier, the one whose baseline opens frontier programmes. */
export function frontierDecadeId(): string {
  return TECH_DECADES[TECH_DECADES.length - 1].id;
}

/** Number of programmes bought so far, over both kinds. */
export function frontierPurchaseCount(counts: FrontierProgrammeCounts | undefined): number {
  return Math.max(0, counts?.output ?? 0) + Math.max(0, counts?.input ?? 0);
}

/** rdScore price of the next programme after `previousPurchases` of any kind. */
export function frontierProgrammeCost(previousPurchases: number): number {
  const base = DECADE_COST[frontierDecadeId()] * FRONTIER_BASE_COST_MULT;
  const n = Math.max(0, Math.floor(previousPurchases));
  return Math.round(base * Math.pow(1 + FRONTIER_COST_GROWTH, n));
}

/**
 * Whether the corporation may buy frontier programmes: the world has reached
 * the last tier and the corporation owns all nine baseline nodes of the lane
 * it committed to there.
 */
export function isFrontierOpen(
  corp: {
    unlockedTechNodeIds?: string[];
    techDecadeLane?: Record<string, TechLane>;
  },
  techType: OperatingSectorType,
  currentYear: number
): boolean {
  const decadeId = frontierDecadeId();
  if (!isDecadeReached(decadeId, currentYear)) return false;
  const owned = new Set(corp.unlockedTechNodeIds ?? []);
  const baseline = (TECH_TREE[techType] ?? []).filter(
    (n) => n.decadeId === decadeId && n.slot <= 9
  );
  return (["generic", "sector"] as const).some((lane) => {
    const committed = corp.techDecadeLane?.[decadeId];
    if (committed && committed !== lane) return false;
    const laneNodes = baseline.filter((n) => n.lane === lane);
    return laneNodes.length > 0 && laneNodes.every((n) => owned.has(n.id));
  });
}

/** The running effects of the programmes bought so far, before the aggregate caps. */
export function frontierProgrammeEffects(
  counts: FrontierProgrammeCounts | undefined
): TechEffect[] {
  const effects: TechEffect[] = [];
  const output = Math.max(0, counts?.output ?? 0);
  const input = Math.max(0, counts?.input ?? 0);
  if (output > 0) effects.push({ kind: "plantOutput", pct: output * FRONTIER_OUTPUT_PCT });
  if (input > 0) effects.push({ kind: "inputEfficiency", pct: input * FRONTIER_INPUT_PCT });
  return effects;
}
