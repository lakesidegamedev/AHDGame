import { SUBSTITUTION_SHARE as SPILLOVER_DEFAULT_SHARE } from "@/lib/market/producerMarket/spilloverRules";

/** The staged funded-market switches in gameConfig, as the physical-preparation env reads them. */
export function producerStageEnv(
  config:
    | {
        producerDemandPlanStage?: number;
        producerLowUseCostStage?: number;
        producerIdleRetireStage?: number;
        decommissionGrantShare?: number;
        producerSpilloverStage?: number;
        producerSpilloverShare?: number;
      }
    | null
    | undefined
) {
  return {
    demandPlanStage: config?.producerDemandPlanStage,
    lowUseCostStage: config?.producerLowUseCostStage,
    idleRetireStage: config?.producerIdleRetireStage,
    decommissionGrantShare: config?.decommissionGrantShare,
    spilloverShare:
      (config?.producerSpilloverStage ?? 0) >= 1
        ? (config?.producerSpilloverShare ?? SPILLOVER_DEFAULT_SHARE)
        : 0,
  };
}
