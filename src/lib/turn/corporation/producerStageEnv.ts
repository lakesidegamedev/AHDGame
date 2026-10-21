import { PUBLIC_CARRY_DEFAULT_SHARE } from "@/lib/market/producerMarket/publicCarryRules";
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
        producerPublicCarryStage?: number;
        producerPublicCarryShare?: number;
        producerRunPaceDrop?: number;
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
    runPaceDrop: config?.producerRunPaceDrop,
    publicCarryShare:
      (config?.producerPublicCarryStage ?? 0) >= 1
        ? (config?.producerPublicCarryShare ?? PUBLIC_CARRY_DEFAULT_SHARE)
        : 0,
  };
}
