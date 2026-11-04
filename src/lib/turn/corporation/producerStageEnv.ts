import { wholePlantsOn } from "@/lib/corporations/wholePlants/rules";
import { PUBLIC_CARRY_DEFAULT_SHARE } from "@/lib/market/producerMarket/publicCarryRules";
import { PROCUREMENT_SPILL_DEFAULT_SHARE } from "@/lib/market/producerMarket/procurementSpillRules";
import { SUBSTITUTION_SHARE as SPILLOVER_DEFAULT_SHARE } from "@/lib/market/producerMarket/spilloverRules";
import {
  LABOUR_WAGE_DEFAULTS,
  WAGE_SHARE_DEFAULT_SURPLUS_CAP,
  WAGE_SHARE_DEFAULT_TARGET,
  type LabourWageParams,
} from "@/lib/market/producerMarket/wageShareRules";

type LabourWageConfig = {
  producerLabourWageStage?: number;
  producerLabourWageNaturalRate?: number;
  producerLabourWageSlackRate?: number;
  producerLabourWageMaxShare?: number;
  producerLabourWageFloorShare?: number;
  producerLabourWageStep?: number;
};

/** The labour-linked wage settings with defaults filled in, or null while its stage is off. */
export function labourWageParams(
  config: LabourWageConfig | null | undefined
): LabourWageParams | null {
  if (!((config?.producerLabourWageStage ?? 0) >= 1)) return null;
  return {
    naturalRate: config?.producerLabourWageNaturalRate ?? LABOUR_WAGE_DEFAULTS.naturalRate,
    slackRate: config?.producerLabourWageSlackRate ?? LABOUR_WAGE_DEFAULTS.slackRate,
    maxShare: config?.producerLabourWageMaxShare ?? LABOUR_WAGE_DEFAULTS.maxShare,
    floorShare: config?.producerLabourWageFloorShare ?? LABOUR_WAGE_DEFAULTS.floorShare,
    step: config?.producerLabourWageStep ?? LABOUR_WAGE_DEFAULTS.step,
  };
}

/** The staged funded-market switches in gameConfig, as the physical-preparation env reads them. */
export function producerStageEnv(
  config:
    | ({
        producerDemandPlanStage?: number;
        producerDemandCurveStage?: number;
        producerLowUseCostStage?: number;
        producerIdleRetireStage?: number;
        decommissionGrantShare?: number;
        producerSpilloverStage?: number;
        producerSpilloverShare?: number;
        producerOwnSitesFirstStage?: number;
        producerPublicCarryStage?: number;
        producerPublicCarryShare?: number;
        producerRunPaceDrop?: number;
        producerHouseholdIncomeFloor?: number;
        producerStockCover?: number;
        producerCreditRunTurns?: number;
        producerCreditStuckTurns?: number;
        producerClearingReferenceStage?: number;
        producerFundedBookStage?: number;
        producerNationalPublicDemandStage?: number;
        producerProcurementSpillStage?: number;
        producerProcurementSpillShare?: number;
        producerShortageGrowthStage?: number;
        producerCaptiveDeliveryStage?: number;
        producerJointRunStage?: number;
        producerFundedRestartStage?: number;
        producerShortageBuildFactor?: number;
        producerWageShareStage?: number;
        producerWageShareTarget?: number;
        producerWageShareSurplusCap?: number;
        wholePlantsStage?: number;
        fiscalScaleStage?: number;
      } & LabourWageConfig)
    | null
    | undefined
) {
  const labourWage = labourWageParams(config);
  return {
    demandPlanStage: config?.producerDemandPlanStage,
    demandCurve: (config?.producerDemandCurveStage ?? 0) >= 1,
    lowUseCostStage: config?.producerLowUseCostStage,
    idleRetireStage: config?.producerIdleRetireStage,
    decommissionGrantShare: config?.decommissionGrantShare,
    fundedBookStage: config?.producerFundedBookStage,
    nationalPublicDemandStage: config?.producerNationalPublicDemandStage,
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
    ownSitesFirst: (config?.producerOwnSitesFirstStage ?? 0) >= 1,
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
    // The labour stage turns the raise on by itself; the constant target is
    // then only the fallback for a state with no unemployment reading.
    wageShareTarget:
      (config?.producerWageShareStage ?? 0) >= 1 || labourWage
        ? (config?.producerWageShareTarget ?? WAGE_SHARE_DEFAULT_TARGET)
        : 0,
    wageShareSurplusCap: config?.producerWageShareSurplusCap ?? WAGE_SHARE_DEFAULT_SURPLUS_CAP,
    labourWage,
  };
}
