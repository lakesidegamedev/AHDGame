import { electricityMode, type ElectricityNetworkMode } from "@/lib/electricityNetwork/rules/types";
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
        electricityNetworkMode?: ElectricityNetworkMode;
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
        producerPublicCarryReleaseStage?: number;
        producerRunPaceDrop?: number;
        producerHouseholdIncomeFloor?: number;
        producerStockCover?: number;
        producerCreditRunTurns?: number;
        producerCreditStuckTurns?: number;
        producerClearingReferenceStage?: number;
        producerFundedBookStage?: number;
        producerNationalPublicDemandStage?: number;
        producerPublicHomeFirstStage?: number;
        producerDemandFloorStage?: number;
        producerPublicFairShareStage?: number;
        producerProcurementSpillStage?: number;
        producerProcurementSpillShare?: number;
        producerShortageGrowthStage?: number;
        producerCaptiveDeliveryStage?: number;
        fundedValuationOwnSiteCreditStage?: number;
        producerJointRunStage?: number;
        producerRunPlanStage?: number;
        producerTariffStage?: number;
        producerSalesAdvancePriceStage?: number;
        producerZombieRestartStage?: number;
        producerHouseholdIncomeSpendStage?: number;
        producerHouseholdSavingsDrawShare?: number;
        producerShortageAskStage?: number;
        producerSalesAdvanceRevenueShare?: number;
        producerShortageAskMaxStep?: number;
        producerAskBuyerTieStage?: number;
        producerSellerPreferenceStage?: number;
        producerPriceMaxMultiplier?: number;
        producerFundedRestartStage?: number;
        producerShortageBuildFactor?: number;
        producerWageShareStage?: number;
        producerWageShareTarget?: number;
        producerWageShareSurplusCap?: number;
        wholePlantsStage?: number;
        wideEconomyStage?: number;
        wideEconomyPricingStage?: number;
        wideEconomySurplusStage?: number;
        newHouseholdIncomeStage?: number;
        householdSpendingPowerStage?: number;
        householdSpendingPowerShare?: number;
        householdSpendingPowerRampTurns?: number;
        householdSpendingPowerStartTurn?: number;
        fiscalScaleStage?: number;
      } & LabourWageConfig)
    | null
    | undefined
) {
  const labourWage = labourWageParams(config);
  return {
    electricityNetworkMode: electricityMode(config),
    demandPlanStage: config?.producerDemandPlanStage,
    demandCurve: (config?.producerDemandCurveStage ?? 1) >= 1,
    lowUseCostStage: config?.producerLowUseCostStage,
    idleRetireStage: config?.producerIdleRetireStage,
    decommissionGrantShare: config?.decommissionGrantShare,
    fundedBookStage: config?.producerFundedBookStage,
    nationalPublicDemandStage: config?.producerNationalPublicDemandStage,
    publicHomeFirstStage: config?.producerPublicHomeFirstStage,
    demandFloorStage: config?.producerDemandFloorStage,
    publicFairShareStage: config?.producerPublicFairShareStage,
    shortageGrowthStage: config?.producerShortageGrowthStage,
    captiveDeliveryStage: config?.producerCaptiveDeliveryStage,
    ownSiteValuationCredit: (config?.fundedValuationOwnSiteCreditStage ?? 0) >= 1,
    jointRunStage: config?.producerJointRunStage,
    runPlanStage: config?.producerRunPlanStage,
    tariffStage: config?.producerTariffStage,
    salesAdvanceAtClearing: (config?.producerSalesAdvancePriceStage ?? 0) >= 1,
    salesAdvanceRevenueShare: config?.producerSalesAdvanceRevenueShare,
    restartProbes: (config?.producerZombieRestartStage ?? 0) >= 1,
    householdIncomeSpendStage: config?.producerHouseholdIncomeSpendStage,
    householdSavingsDrawShare: config?.producerHouseholdSavingsDrawShare,
    shortageAskStage: config?.producerShortageAskStage,
    shortageAskMaxStep: config?.producerShortageAskMaxStep,
    askBuyerTieStage: config?.producerAskBuyerTieStage,
    sellerPreferenceStage: config?.producerSellerPreferenceStage,
    priceMaxMultiplier: config?.producerPriceMaxMultiplier,
    fundedRestartStage: config?.producerFundedRestartStage,
    shortageBuildFactor: config?.producerShortageBuildFactor,
    wholePlants: wholePlantsOn(config?.wholePlantsStage),
    fiscalScaleStage: config?.fiscalScaleStage,
    // Ships on: absent means stage 1; set 0 to switch it off.
    wideEconomyStage: config?.wideEconomyStage ?? 1,
    // Ships on as well: the price counts what the wider economy sold.
    wideEconomyPricingStage: config?.wideEconomyPricingStage ?? 1,
    // And the buyer's oversupplied-lane boost.
    wideEconomySurplusStage: config?.wideEconomySurplusStage ?? 1,
    // New household income by real GDP growth ships on too.
    newHouseholdIncomeStage: config?.newHouseholdIncomeStage ?? 1,
    // Spending power top-up (population times wage) ships on too.
    householdSpendingPowerStage: config?.householdSpendingPowerStage ?? 1,
    householdSpendingPowerShare: config?.householdSpendingPowerShare,
    householdSpendingPowerRampTurns: config?.householdSpendingPowerRampTurns,
    householdSpendingPowerStartTurn: config?.householdSpendingPowerStartTurn,
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
    publicCarryRelease: (config?.producerPublicCarryReleaseStage ?? 0) >= 1,
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
