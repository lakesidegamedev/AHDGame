import {
  STAGE_INDEX,
  clamp,
  type CrisisDefinition,
  type CrisisInstance,
  type CrisisScar,
  type CrisisScope,
  type CrisisStage,
} from "./types";

/** A scar never costs more than this share of its target, however bad the peak. */
export const MAX_SCAR_MAGNITUDE = 0.5;

/** Where a scar lands: regional crises scar their regions, wider ones their countries. */
export function scarTargets(
  scope: CrisisScope,
  countryIds: readonly string[],
  regionIds: readonly string[]
): string[] {
  if ((scope === "local" || scope === "state") && regionIds.length > 0) return [...regionIds];
  return [...countryIds];
}

/**
 * Scars a crisis lays down this turn. A rule fires once, the first turn the
 * crisis has reached its stage while its peak is high enough, and sizes the scar
 * from how far the peak went past the rule's floor.
 */
export function layScars(
  def: CrisisDefinition,
  instance: Pick<CrisisInstance, "stage" | "peakSeverity" | "scars">,
  targets: readonly string[],
  turn: number
): CrisisScar[] {
  const laid: CrisisScar[] = [];
  const stage: CrisisStage = instance.stage;
  for (const rule of def.scarRules) {
    if (STAGE_INDEX[stage] < STAGE_INDEX[rule.onStage]) continue;
    if (instance.peakSeverity < rule.minPeakSeverity) continue;
    if (instance.scars.some((scar) => scar.ruleId === rule.id)) continue;
    const magnitude = clamp(
      (instance.peakSeverity - rule.minPeakSeverity) * rule.magnitudePerPoint,
      0,
      MAX_SCAR_MAGNITUDE
    );
    if (magnitude <= 0) continue;
    for (const targetId of targets) {
      laid.push({
        ruleId: rule.id,
        kind: rule.kind,
        targetId,
        magnitude,
        createdTurn: turn,
        recoveryTurns: rule.recoveryTurns,
        ...(rule.sectorType ? { sectorType: rule.sectorType } : {}),
      });
    }
  }
  return laid;
}

/** Share of a scar still in force at `turn`: full when laid, nothing after recovery. */
export function scarRemaining(scar: CrisisScar, turn: number): number {
  const elapsed = Math.max(0, turn - scar.createdTurn);
  return scar.magnitude * clamp(1 - elapsed / scar.recoveryTurns, 0, 1);
}

/** Last turn any scar is still in force; -Infinity when there are none. */
export function scarHorizon(scars: readonly CrisisScar[]): number {
  let horizon = -Infinity;
  for (const scar of scars) horizon = Math.max(horizon, scar.createdTurn + scar.recoveryTurns);
  return horizon;
}

export interface ScarStep {
  scar: CrisisScar;
  /** Loss in force after this step. */
  remaining: number;
  /** Change in loss written to the world this step: positive deepens it, negative heals it. */
  change: number;
}

/** Output scars are read live each turn; every other kind is written as a difference. */
export const LEVEL_SCAR_KINDS: ReadonlySet<CrisisScar["kind"]> = new Set([
  "regionalOutput",
  "plantCapacity",
]);

/**
 * Advances every difference-written scar to `turn` and returns the steps to
 * apply with the updated scars. Level scars pass through untouched.
 */
export function stepScars(
  scars: readonly CrisisScar[],
  turn: number
): { scars: CrisisScar[]; steps: ScarStep[] } {
  const steps: ScarStep[] = [];
  const next = scars.map((scar) => {
    if (LEVEL_SCAR_KINDS.has(scar.kind)) return scar;
    const remaining = scarRemaining(scar, turn);
    const change = remaining - (scar.applied ?? 0);
    if (Math.abs(change) < 1e-12) return scar;
    steps.push({ scar, remaining, change });
    return { ...scar, applied: remaining };
  });
  return { scars: next, steps };
}

/** Output cut in margin points (<= 0) each live level scar imposes at `turn`. */
export function scarOutputPoints(scar: CrisisScar, turn: number): number {
  return -scarRemaining(scar, turn) * 100;
}
