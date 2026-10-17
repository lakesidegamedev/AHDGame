/**
 * Market recovery program (kanban 254504): staged corrections advanced one per
 * turn via `gameConfig.marketRecoveryStage` (0 = none).
 *
 * Why staged: each correction ships dark, turns on with a config write that
 * takes effect next turn, is health-checked one turn later and reverts alone by
 * lowering the number. Same pattern as `commodityFixStages.ts`. Each stage is a
 * pure function of the stage number. The switch and its dead branches are
 * deleted once every stage has held for 48 turns.
 */
import type { OperatingSectorType } from "@/lib/constants/corporations";

export const MARKET_RECOVERY_STAGE = {
  /**
   * Temporary relief: the #3551 payroll rise for four service industries sits
   * halfway back (technology and healthcare 0.40 -> 0.35, financial 0.40 ->
   * 0.325, real estate 0.32 -> 0.21) until the phase 1 cost recalibration.
   */
  SERVICE_LABOUR_RELIEF: 1,
} as const;

export const MARKET_RECOVERY_STAGE_MAX = MARKET_RECOVERY_STAGE.SERVICE_LABOUR_RELIEF;

/** Normalise a raw config value to an integer stage in [0, MAX]. */
export function normalizeMarketRecoveryStage(raw: unknown): number {
  if (typeof raw !== "number" || !Number.isFinite(raw)) return 0;
  return Math.max(0, Math.min(MARKET_RECOVERY_STAGE_MAX, Math.trunc(raw)));
}

export function marketRecoveryStageActive(
  stage: number | null | undefined,
  atLeast: number
): boolean {
  return normalizeMarketRecoveryStage(stage) >= atLeast;
}

/**
 * Stage 1 payroll factor per service industry: relieved intensity over the
 * #3551 intensity. Applied to the full labour share (era multiplier and
 * production-method blend included), so it scales exactly the service rate.
 * Static replay at turn 269: losing plants 28.9% -> 26.9%; healthcare margin
 * -7% -> -2%; real estate +7% -> +15%.
 */
export const SERVICE_LABOUR_RELIEF_FACTOR: Partial<Record<OperatingSectorType, number>> = {
  technology: 0.35 / 0.4,
  healthcare: 0.35 / 0.4,
  financial: 0.325 / 0.4,
  real_estate: 0.21 / 0.32,
};

/** A sector's labour share after the stages active in this world. */
export function stagedLaborShare(
  sectorType: string,
  share: number,
  stage: number | null | undefined
): number {
  if (!marketRecoveryStageActive(stage, MARKET_RECOVERY_STAGE.SERVICE_LABOUR_RELIEF)) return share;
  const factor = SERVICE_LABOUR_RELIEF_FACTOR[sectorType as OperatingSectorType];
  return typeof factor === "number" ? share * factor : share;
}
