/**
 * In 1991 presets, plant investment prices capacity at one day of its nominal
 * output. Other presets retain the growth multiplier and era price column.
 * capacityPricePerUnit selects this basis. computeBuildCost applies host costs, borrowing rates,
 * CEO skill, technology and dominance; expanding existing plants gets a 20%
 * discount. Only the 1991 calibration omits the additional nominal price index. Idle capacity pays 30% upkeep and
 * mothballed capacity pays 5%.
 *
 * Capacity is output units per day. capacityUnitYield maps the commodity mix
 * to units per anchor currency; its inverse is revenuePerCapacityUnit. Both
 * conversions carry the same eraUnitScale. Prices follow the actual strategy,
 * preserving the value of cheap and expensive output baskets across retools.
 */

export {
  CAPACITY_REVENUE_PER_WORKER,
  CAPACITY_ANCHOR_YEAR,
  CAPACITY_BUILD_TURNS_DEFAULT,
  CAPACITY_SECTOR_TYPES,
  CAPACITY_BUILD_CANCEL_REFUND,
  MOTHBALL_UPKEEP_FRACTION,
  IDLE_UPKEEP_FRACTION,
  PLANT_CREW_FLOOR_SHARE,
  RESTART_RUN_SHARE,
  PLANT_CREW_MAX_DROP_PER_TURN,
  PLANT_CREW_SUSTAINED_GLUT_MAX_DROP_PER_TURN,
  PLANT_CREW_SUSTAINED_GLUT_THROTTLE,
  THROTTLE_IDLE_UPKEEP_SHARE,
  CAPACITY_FOUNDING_DISCOUNT,
  ATTACK_CAPTURE_EFFICIENCY,
  ATTACK_BUILD_PRICE_PREMIUM,
  MAX_BUILD_UNITS_PER_ORDER,
  HOST_BUILD_PRICE_INDEX_MIN,
  HOST_BUILD_PRICE_INDEX_MAX,
} from "./capacityEconomyTables";

export {
  defaultSupplyRates,
  capacityUnitYield,
  safeUnitScale,
  revenuePerCapacityUnit,
  unitYieldForSupply,
  revenuePerCapacityUnitForStrategy,
  rescaleCapacityForStrategyChange,
  capacityRescaleRatio,
  rescaleBuildQueueForStrategyChange,
  techOutputUnitsMultiplier,
  capacityEraPriceIndex,
  capacityEraLaborIndex,
  capacityPricePerUnit,
  laborIntensity,
  CAPACITY_BUILD_TURNS,
  techBuildTurns,
  hostBuildPriceIndex,
  computeBuildCost,
} from "@/lib/corporations/rules/capacityEconomy";
export type { BuildCostInputs, BuildCostBreakdown } from "@/lib/corporations/rules/capacityEconomy";
