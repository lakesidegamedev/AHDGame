/**
 * Funded demand floor (gameConfig.producerDemandFloorStage). Budget lines are
 * scaled by the plant economy's share of GDP, which is near zero in a young
 * world, so nothing is bought and nobody builds. The floor sets a minimum share.
 */

/** Minimum plant-economy share of GDP by stage. */
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
