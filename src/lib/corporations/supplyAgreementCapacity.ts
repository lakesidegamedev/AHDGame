import { activeCapacityFraction } from "@/lib/corporations/investment/rules";
import type { CorporationType } from "@/lib/constants/corporations";
import type { MediaDiscriminator } from "@/lib/constants/corporations";
import {
  COMMODITY_BASE_PRICES,
  commodityMixWeight,
  embargoSupplyFactorFor,
  plantsCapacityScaledUnits,
  plantsSupplyScaledUnits,
  type CommodityType,
} from "@/lib/constants/commodities";
import {
  getEffectiveStrategyRatesForOperatingModel,
  plannedEconomyMediaSupplyFactor,
} from "@/lib/constants/sectorStrategies";
import { retoolOperatingCapacityRatio } from "@/lib/corporations/retooling/rules";
import { isPlannedEconomy } from "@/lib/constants/commandEconomy";

/**
 * Sector snapshot the plants-tier supply-agreement capacity check needs.
 * Matches the projection the propose route already loads.
 */
export type SupplyAgreementCapacitySector = {
  sectorType: CorporationType;
  industryModel?: string | null;
  mediaDiscriminator?: MediaDiscriminator | null;
  capitalStock?: number | null;
  strategyId?: string | null;
  transitionFromStrategyId?: string | null;
  transitionStartTurn?: number | null;
  retoolRescaleApplied?: boolean;
  mothballed?: boolean | null;
  activeCapacityPercent?: number;
  productionPolicyLevel?: number | null;
  embargoSuspended?: boolean | null;
  embargoExportExposure?: number | null;
  /** Host country, for the planned-economy output remap and media derate. */
  countryId?: string | null;
  /** Host state, so a state-scoped contract can be sized against one state's plants. */
  stateId?: string | null;
  /** Latest full-policy output after external constraints. */
  contractAchievableUnits?: number | null;
};

/**
 * The plants a contract is fulfilled from. A corporation-wide agreement draws
 * on every plant; a state-scoped one only on the plants in its named state.
 */
export function supplyAgreementSectorsInScope<T extends { stateId?: string | null }>(
  sectors: readonly T[],
  stateId?: string | null
): T[] {
  if (!stateId) return [...sectors];
  return sectors.filter((s) => s.stateId === stateId);
}

/** Distinct host states across a supplier's plants, for the state picker. */
export function supplyAgreementSectorStates(
  sectors: readonly { stateId?: string | null }[]
): string[] {
  return [...new Set(sectors.map((s) => s.stateId).filter((id): id is string => !!id))].sort();
}

/**
 * Usable daily output of `commodity` across a supplier's plants, in the same
 * units `volumeCap` is denominated in. Shared by the player propose route and
 * the NPP matcher so the two cannot drift.
 *
 * Mothballed plants contribute nothing. Scaling goes through
 * `plantsCapacityScaledUnits` (production policy, natcorp, embargo) then the
 * canonical mix split, identical to clearing and the world supply ledger. The
 * capacity variant is required here because the input is NAMEPLATE capacity,
 * which has never been through `sectorTurn` and so does not yet carry the
 * production-policy output curve.
 */
/**
 * A sector's effective output mix: the recipe after transition blending and the
 * hardware input relief, exactly as the capacity and achievable legs price it.
 * Split out so a caller that prices several commodities for the same sector
 * resolves it once instead of once per commodity.
 */
export function supplierCommoditySupplyMix(
  sector: SupplyAgreementCapacitySector,
  turn: number
): Partial<Record<CommodityType, number>> {
  return (
    getEffectiveStrategyRatesForOperatingModel(
      sector.sectorType,
      sector.strategyId ?? "standard",
      sector.transitionFromStrategyId,
      sector.transitionStartTurn,
      turn,
      sector.industryModel,
      sector.mediaDiscriminator
    ).supply ?? {}
  );
}

/**
 * Scaled output units a plant's NAMEPLATE capacity stands for, before the
 * commodity mix split. Every leg of this chain is a multiplier on capacity, so
 * pricing a hypothetical stock (an order, a queued build) is this same call
 * with a different `capacityUnits` — never a re-derivation of the rates, which
 * is the expensive half of the calculation.
 */
export function supplierScaledCapacityUnits(args: {
  sector: SupplyAgreementCapacitySector;
  isNatcorp: boolean;
  turn: number;
  currentYear?: number | null;
  commandEconomyEnabled?: boolean | null;
  /** Nameplate capacity to price; defaults to the sector's own stock. */
  capacityUnits?: number | null;
}): number {
  const { sector } = args;
  if (sector.mothballed === true) return 0;
  const capacity =
    (typeof args.capacityUnits === "number"
      ? args.capacityUnits
      : typeof sector.capitalStock === "number"
        ? sector.capitalStock
        : 0) *
    retoolOperatingCapacityRatio({ ...sector, currentTurn: args.turn }) *
    activeCapacityFraction({ activeCapacityPercent: sector.activeCapacityPercent });
  if (!(capacity > 0)) return 0;
  // A command economy's media makes state information rather than advertising,
  // and media supply is derated in every economy.
  const plannedEconomy = isPlannedEconomy(
    sector.countryId,
    args.currentYear,
    args.commandEconomyEnabled
  );
  return (
    plantsCapacityScaledUnits({
      capacityUnits: capacity,
      isNatcorp: args.isNatcorp,
      productionPolicyLevel: sector.productionPolicyLevel,
      embargoSupplyFactor:
        embargoSupplyFactorFor(sector) *
        plannedEconomyMediaSupplyFactor(
          sector.sectorType,
          plannedEconomy,
          sector.mediaDiscriminator
        ),
    }) ?? 0
  );
}

export function computeSupplierCommodityCapacityUnits(args: {
  sectors: readonly SupplyAgreementCapacitySector[];
  commodity: CommodityType;
  isNatcorp: boolean;
  turn: number;
  /** `gameState.currentYear` — with the flag below, resolves planned economies. */
  currentYear?: number | null;
  /** `gameConfig.commandEconomyEnabled`. */
  commandEconomyEnabled?: boolean | null;
  /** State-scoped contract: count only the plants in this state. */
  stateId?: string | null;
  /** Per-sector mix memo shared across commodities; see supplierCommoditySupplyMix. */
  supplyMixOf?: (sector: SupplyAgreementCapacitySector) => Partial<Record<CommodityType, number>>;
}): number {
  let capacityUnits = 0;
  for (const s of supplyAgreementSectorsInScope(args.sectors, args.stateId)) {
    const scaled = supplierScaledCapacityUnits({
      sector: s,
      isNatcorp: args.isNatcorp,
      turn: args.turn,
      currentYear: args.currentYear,
      commandEconomyEnabled: args.commandEconomyEnabled,
    });
    if (!(scaled > 0)) continue;
    // The output mix has to match the production sink, or the head-room sits on
    // a base the supplier can never reach and the shortfall leg bills them for
    // the gap every turn.
    const supplyMix = args.supplyMixOf?.(s) ?? supplierCommoditySupplyMix(s, args.turn);
    capacityUnits += scaled * commodityMixWeight(supplyMix, COMMODITY_BASE_PRICES, args.commodity);
  }
  return capacityUnits;
}

/**
 * Latest known damage ceiling for one commodity across a supplier's sectors.
 * Returns null when any contributing sector has not produced rollout telemetry.
 * Numeric zero is known zero and must remain distinct from unknown.
 */
export function computeSupplierCommodityAchievableUnits(args: {
  sectors: readonly SupplyAgreementCapacitySector[];
  commodity: CommodityType;
  isNatcorp: boolean;
  turn: number;
  currentYear?: number | null;
  commandEconomyEnabled?: boolean | null;
  /** State-scoped contract: count only the plants in this state. */
  stateId?: string | null;
}): number | null {
  let units = 0;
  for (const sector of supplyAgreementSectorsInScope(args.sectors, args.stateId)) {
    const rates = getEffectiveStrategyRatesForOperatingModel(
      sector.sectorType,
      sector.strategyId ?? "standard",
      sector.transitionFromStrategyId,
      sector.transitionStartTurn,
      args.turn,
      sector.industryModel,
      sector.mediaDiscriminator
    );
    const plannedEconomy = isPlannedEconomy(
      sector.countryId,
      args.currentYear,
      args.commandEconomyEnabled
    );
    const supplyMix = rates.supply ?? {};
    const weight = commodityMixWeight(supplyMix, COMMODITY_BASE_PRICES, args.commodity);
    if (!(weight > 0)) continue;
    const scaled = plantsSupplyScaledUnits({
      producedUnits: sector.contractAchievableUnits,
      isNatcorp: args.isNatcorp,
      embargoSupplyFactor:
        embargoSupplyFactorFor(sector) *
        plannedEconomyMediaSupplyFactor(
          sector.sectorType,
          plannedEconomy,
          sector.mediaDiscriminator
        ),
    });
    if (scaled === null) return null;
    units += scaled * weight;
  }
  return units;
}
