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
  /**
   * The 1.14 flat margin charge (SECTOR_MARGIN_LEVEL_TRIM_PP, 8 points) was
   * tuned when the world ran a 21.8% median net margin; at turn 270 the median
   * plant margin is 9%. Stage 2 lowers it to MARGIN_TRIM_STAGE2_PP. It rides
   * the plants policy credit, so it moves on the next turn and reverts alone.
   */
  MARGIN_TRIM_RELIEF: 2,
  /**
   * Price memory damping, first step: scarcity memory and producer cost
   * pass-through keep 75% of their excess over 1 when forming prices. The
   * persisted multipliers are untouched, so lowering the stage restores the
   * old price targets exactly.
   */
  PRICE_MEMORY_DAMP_1: 3,
  /** Second step: 50% of the excess. */
  PRICE_MEMORY_DAMP_2: 4,
  /**
   * Standalone AI companies sell one off-type plant per turn, at book value
   * plus inventory, to a same-type AI company in the same country
   * (corporations/offTypeHandover.ts). Lowering the stage stops new handovers;
   * completed ones stand, as any sale does.
   */
  AI_OFF_TYPE_HANDOVER: 5,
} as const;

export const MARKET_RECOVERY_STAGE_MAX = MARKET_RECOVERY_STAGE.AI_OFF_TYPE_HANDOVER;

/** Share of price-memory excess (multiplier minus 1) kept at the active stage. */
function priceMemoryKeep(stage: number | null | undefined): number {
  if (marketRecoveryStageActive(stage, MARKET_RECOVERY_STAGE.PRICE_MEMORY_DAMP_2)) return 0.5;
  if (marketRecoveryStageActive(stage, MARKET_RECOVERY_STAGE.PRICE_MEMORY_DAMP_1)) return 0.75;
  return 1;
}

/** A price-memory multiplier as it enters price formation at the active stage. */
export function dampedMemoryMultiplier(
  multiplier: number,
  stage: number | null | undefined
): number {
  if (!Number.isFinite(multiplier)) return multiplier;
  return 1 + (multiplier - 1) * priceMemoryKeep(stage);
}

/**
 * Margin level trim at stage 2, in percentage points. Static replay at turn
 * 270 with stage 1: losing plants 25.7% -> 15.8%, median margin 9.8% -> 17.8%.
 */
export const MARGIN_TRIM_STAGE2_PP = 0;

/** The flat margin trim for the stages active in this world. */
export function stagedMarginTrimPp(
  trimPp: number | null | undefined,
  stage: number | null | undefined
): number {
  const base = typeof trimPp === "number" && Number.isFinite(trimPp) ? trimPp : 0;
  return marketRecoveryStageActive(stage, MARKET_RECOVERY_STAGE.MARGIN_TRIM_RELIEF)
    ? Math.min(base, MARGIN_TRIM_STAGE2_PP)
    : base;
}

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
 * Stage 1 (temporary service payroll relief) was superseded by the phase 1
 * recalibration of SECTOR_LABOR_INTENSITY on 2026-10-18, which sets those four
 * shares at or below the relieved values directly. The stage number stays so
 * live worlds keep their stage, and it no longer scales anything.
 */
const SERVICE_LABOUR_RELIEF_FACTOR: Partial<Record<OperatingSectorType, number>> = {};

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
