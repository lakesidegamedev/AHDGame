/** Input demand uses the market ledger recipe, production utilization and era unit scale. */
import {
  energyProductivityMultiplier,
  plantUtilizationForInputs,
} from "@/lib/corporations/rules/energyProductivityRamp";
import { getEffectiveStrategyRatesForOperatingModel } from "@/lib/constants/sectorStrategies";
import { getInputMultiplier } from "@/lib/utils/productionPolicy";
import {
  COMMODITY_BASE_PRICES,
  NATCORP_COMMODITY_MULTIPLIER,
  dollarsToUnits,
  type CommodityType,
} from "@/lib/constants/commodities";
import {
  supplyAgreementRequiresState,
  supplyAgreementScopeKey,
} from "@/lib/market/commodityMarketScope";
import type { SupplyAgreementDemandSector } from "@/lib/turn/corporation/settleSupplyAgreementsAllocation";
/**
 * Input units one sector demands this turn, keyed by commodity.
 *
 * The per-sector form exists because the internal-supply and group-supply
 * passes need each sector's own demand to split an agreement across its
 * plants. `computeSupplyAgreementBuyerDemand` used to be called with a
 * one-element array for that, which built an outer corporation map and threw it
 * away once per sector. State-scope keys are the buyer aggregate's business,
 * so this returns the commodity totals alone.
 */
export function computeSupplyAgreementSectorDemand(args: {
  preset?: string;
  hardwareInputReliefStartTurn?: number;
  sector: SupplyAgreementDemandSector;
  currentTurn: number;
  unitScale: number;
  plantsEnabled: boolean;
}): Map<CommodityType, number> {
  const units = new Map<CommodityType, number>();
  const sector = args.sector;
  if (args.plantsEnabled && sector.mothballed === true) return units;
  const unitScale = Number.isFinite(args.unitScale) && args.unitScale > 0 ? args.unitScale : 1;
  const rates = getEffectiveStrategyRatesForOperatingModel(
    sector.sectorType,
    sector.strategyId ?? "standard",
    sector.transitionFromStrategyId,
    sector.transitionStartTurn,
    args.currentTurn,
    sector.industryModel,
    sector.mediaDiscriminator,
    args.preset,
    args.hardwareInputReliefStartTurn
  );
  const utilization =
    args.plantsEnabled &&
    typeof sector.producedUnits === "number" &&
    typeof sector.capacityUnits === "number" &&
    sector.capacityUnits > 0
      ? plantUtilizationForInputs(
          sector.producedUnits,
          sector.capacityUnits,
          energyProductivityMultiplier(sector.sectorType, args.currentTurn, args.preset)
        )
      : 1;
  const inputMultiplier = getInputMultiplier(sector.productionPolicyLevel ?? 0);
  const natcorpMultiplier = sector.isNatcorp ? NATCORP_COMMODITY_MULTIPLIER : 1;
  const demand = rates.demand ?? {};
  // Object.keys would allocate one array per sector; the table is plain data
  // and every key is a commodity, so iterate it directly.
  for (const commodity in demand) {
    const rate = demand[commodity as CommodityType];
    if (!(rate && rate > 0)) continue;
    const basePrice = COMMODITY_BASE_PRICES[commodity as CommodityType];
    if (!(basePrice > 0)) continue;
    const demanded =
      dollarsToUnits(Math.max(0, sector.revenueAnchor) * rate, basePrice) *
      unitScale *
      inputMultiplier *
      natcorpMultiplier *
      utilization;
    if (!(demanded > 0)) continue;
    units.set(commodity as CommodityType, demanded);
  }
  return units;
}

export function computeSupplyAgreementBuyerDemand(args: {
  preset?: string;
  hardwareInputReliefStartTurn?: number;
  sectors: readonly SupplyAgreementDemandSector[];
  currentTurn: number;
  unitScale: number;
  plantsEnabled: boolean;
}): Map<string, Map<string, number>> {
  const result = new Map<string, Map<string, number>>();

  for (const sector of args.sectors) {
    const demand = computeSupplyAgreementSectorDemand({
      preset: args.preset,
      hardwareInputReliefStartTurn: args.hardwareInputReliefStartTurn,
      sector,
      currentTurn: args.currentTurn,
      unitScale: args.unitScale,
      plantsEnabled: args.plantsEnabled,
    });
    if (demand.size === 0) continue;
    const byKey = result.get(sector.corporationId) ?? new Map<string, number>();
    for (const [commodity, units] of demand) {
      byKey.set(commodity, (byKey.get(commodity) ?? 0) + units);
      if (sector.stateId && supplyAgreementRequiresState(commodity)) {
        const stateKey = supplyAgreementScopeKey(commodity, sector.stateId);
        byKey.set(stateKey, (byKey.get(stateKey) ?? 0) + units);
      }
    }
    result.set(sector.corporationId, byKey);
  }

  return result;
}
