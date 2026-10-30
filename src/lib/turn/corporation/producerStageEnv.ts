import { wholePlantsOn } from "@/lib/corporations/wholePlants/rules";
import { PUBLIC_CARRY_DEFAULT_SHARE } from "@/lib/market/producerMarket/publicCarryRules";
import { PROCUREMENT_SPILL_DEFAULT_SHARE } from "@/lib/market/producerMarket/procurementSpillRules";
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
        producerHouseholdIncomeFloor?: number;
        producerStockCover?: number;
        producerCreditRunTurns?: number;
        producerCreditStuckTurns?: number;
        producerClearingReferenceStage?: number;
        producerFundedBookStage?: number;
        producerProcurementSpillStage?: number;
        producerProcurementSpillShare?: number;
        producerShortageGrowthStage?: number;
        producerCaptiveDeliveryStage?: number;
        producerJointRunStage?: number;
        producerFundedRestartStage?: number;
        producerShortageBuildFactor?: number;
        wholePlantsStage?: number;
        fiscalScaleStage?: number;
      }
    | null
    | undefined
) {
  return {
    demandPlanStage: config?.producerDemandPlanStage,
    lowUseCostStage: config?.producerLowUseCostStage,
    idleRetireStage: config?.producerIdleRetireStage,
    decommissionGrantShare: config?.decommissionGrantShare,
    fundedBookStage: config?.producerFundedBookStage,
    shortageGrowthStage: config?.producerShortageGrowthStage,
    captiveDeliveryStage: config?.producerCaptiveDeliveryStage,
    jointRunStage: config?.producerJointRunStage,
    fundedRestartStage: config?.producerFundedRestartStage,
    shortageBuildFactor: config?.producerShortageBuildFactor,
    wholePlants: wholePlantsOn(config?.wholePlantsStage),
    fiscalScaleStage: config?.fiscalScaleStage,
    spilloverShare:
      (config?.producerSpilloverStage ?? 0) >= 1
        ? (config?.producerSpilloverShare ?? SPILLOVER_DEFAULT_SHARE)
        : 0,
    runPaceDrop: config?.producerRunPaceDrop,
    householdIncomeFloor: config?.producerHouseholdIncomeFloor,
    stockCoverTurns: config?.producerStockCover,
    creditRunTurns: config?.producerCreditRunTurns,
    creditStuckTurns: config?.producerCreditStuckTurns,
    clearingReferenceStage: config?.producerClearingReferenceStage,
    publicCarryShare:
      (config?.producerPublicCarryStage ?? 0) >= 1
        ? (config?.producerPublicCarryShare ?? PUBLIC_CARRY_DEFAULT_SHARE)
        : 0,
    procurementSpillShare:
      (config?.producerProcurementSpillStage ?? 0) >= 1
        ? (config?.producerProcurementSpillShare ?? PROCUREMENT_SPILL_DEFAULT_SHARE)
        : 0,
  };
}
