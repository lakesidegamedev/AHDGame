/**
 * Funded demand floor (gameConfig.producerDemandFloorStage).
 *
 * Public buying and household transfers are the budget lines scaled by the
 * plant economy's share of GDP. A young world has almost no plants, so the
 * share is near zero, nothing is bought, nobody builds and the share stays
 * near zero. The floor lifts that share to a minimum so the budget lines the
 * treasury already spends reach the plant market from the first turn. Once
 * plants grow past the floor the measured share is used unchanged.
 *
 * The money is the same budget outlay as before (minted against the treasury's
 * own spending, or drawn from its cash under fiscal scale stage 2). Nothing
 * extra is created; the floor only raises how much of each line is spent here,
 * and the share can never exceed 1, the whole line.
 *
 * Pure: stage and measured share in, share out.
 */

/**
 * Minimum plant-economy share of GDP by stage. Stage 1 is the standing floor
 * for a young world; higher stages are deliberate raises.
 */
export const DEMAND_FLOOR_SHARE_BY_STAGE: readonly number[] = [0, 2e-6, 1e-5, 5e-5];

export function demandFloorShare(stage: number | undefined): number {
  if (typeof stage !== "number" || !Number.isFinite(stage) || stage < 1) return 0;
  const top = DEMAND_FLOOR_SHARE_BY_STAGE.length - 1;
  return DEMAND_FLOOR_SHARE_BY_STAGE[Math.min(top, Math.floor(stage))] ?? 0;
}

/** The share a country's budget lines are scaled by: the measured share, never below the floor. */
export function flooredPlantShare(measuredShare: number, stage: number | undefined): number {
  const measured = Number.isFinite(measuredShare) ? Math.max(0, measuredShare) : 0;
  return Math.min(1, Math.max(measured, demandFloorShare(stage)));
}
