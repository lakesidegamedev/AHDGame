/** The staged funded-market switches in gameConfig, as the physical-preparation env reads them. */
export function producerStageEnv(
  config:
    | {
        producerDemandPlanStage?: number;
        producerLowUseCostStage?: number;
      }
    | null
    | undefined
) {
  return {
    demandPlanStage: config?.producerDemandPlanStage,
    lowUseCostStage: config?.producerLowUseCostStage,
  };
}
