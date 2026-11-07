/**
 * Strength upkeep stages and the marketing decay arithmetic, with no imports.
 *
 * The wiki strength charts and the corporation strength projection run in the
 * browser and need only these numbers. The shield calculation in
 * `strengthUpkeep.ts` reads the whole tech tree, so it stays out of here.
 */
export const STRENGTH_UPKEEP_STAGE = {
  /** Dominance shield capped at DOMINANCE_SHIELD_UPKEEP_CAP, expiring with its decade. */
  SHIELD: 1,
  /** Group synergy is paid for by the group leader. */
  SYNERGY_TRANSFER: 2,
  /** Marketing strength decays MARKETING_DECAY_RATE per turn. */
  MARKETING_DECAY: 3,
} as const;

/** Marketing strength lost per turn once decay is on (halved from 3% on 2026-10-22). */
export const MARKETING_DECAY_RATE = 0.015;

/** Most of the dominance toll a tech shield may remove once capped. */
export const DOMINANCE_SHIELD_UPKEEP_CAP = 0.5;

export function strengthUpkeepActive(stage: number | null | undefined, required: number): boolean {
  return typeof stage === "number" && Number.isFinite(stage) && stage >= required;
}

/** New marketing strength after one turn of decay (when on) and growth. */
export function marketingStrengthAfterTurn(
  current: number,
  growth: number,
  stage: number | null | undefined
): number {
  const base = Number.isFinite(current) ? Math.max(0, current) : 0;
  const decayed = strengthUpkeepActive(stage, STRENGTH_UPKEEP_STAGE.MARKETING_DECAY)
    ? base * (1 - MARKETING_DECAY_RATE)
    : base;
  return Math.max(0, decayed + (Number.isFinite(growth) ? growth : 0));
}
