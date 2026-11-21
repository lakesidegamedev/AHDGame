import { settleSourcingPass } from "@/lib/logistics/settleSourcingPass";

export {
  GRID_LOSS_PER_HOP,
  GRID_WHEELING_PER_HOP_FRACTION,
  FREIGHT_CONGESTION_OVERFLOW,
  SEA_FREIGHT_HOP_EQUIV,
} from "@/lib/logistics/sourcingConstants";

export {
  FREIGHT_PRICE_TEU_PER_UNIT_HOP,
  FREIGHT_SHIPPING_MAX_ASK_SHARE,
  boundedShippingPerUnit,
  FREIGHT_CONGESTION_SURCHARGE,
  BUYER_TOLERANCE_SLACK,
  SHORTAGE_TOLERANCE_MAX_EXTRA,
  shortageResponsiveToleranceSlack,
} from "@/lib/logistics/sourcingPrices";
import type {
  SourcingFlow,
  SourcingCommoditySummary,
  SourcingPairAggregate,
  SourcingDestinationAggregate,
  LandedPremiumAccumulator,
  ImportAggregate,
  SourcingForeignQuote,
  SourcingResult,
  SourcingInputs,
} from "@/lib/logistics/sourcingTypes";
export type {
  SourcingFlow,
  SourcingCommoditySummary,
  SourcingPairAggregate,
  SourcingDestinationAggregate,
  LandedPremiumAccumulator,
  ImportAggregate,
  SourcingForeignQuote,
  SourcingResult,
  SourcingInputs,
} from "@/lib/logistics/sourcingTypes";
/**
 * Landed-price sourcing pass. RECORD-ONLY.
 *
 * For each shipped commodity, each state with unmet local demand ranks
 * candidates by landed price:
 *
 *   landed = seller's ask + shipping (per hop, by freight class) + tariff
 *
 * and fills cheapest-first up to the buyer's tolerance ceiling, the seller's
 * spare, and the origin state's shared freight capacity. Intra-state fill is
 * free and consumes no capacity.
 *
 * MUTATES NOTHING in the price model: reads copies of balances and returns a
 * flow ledger. Supply, demand, prices and trade clearing behave as before.
 *
 * Asks are last turn's stored prices: fixed, one pass, predictable. For
 * planned economies stored national prices already carry the administered
 * value. Capacity is consumed in buyer fill order rather than globally; revisit
 * with money wiring if the ledger shows order artifacts.
 */

import type { CommodityType } from "@/lib/constants/commodities";
import type { SourcingOwnRoute } from "./ownRoutes";
import { ownRouteBudgets } from "./rules/ownPriority";
import type { CountryId } from "@/lib/constants/countries";
import {
  emptyPurchaseExposure,
  type PurchaseExposure,
  type PurchaseUse,
} from "./rules/purchaseExposure";
import { createOwnFreightLedger } from "./rules/ownFreight";
import {
  FREIGHT_CLASS_BY_COMMODITY,
  isHauledClass,
  SHIPPED_COMMODITIES,
  freightTeuPerUnitHop,
  type FreightClass,
} from "./freightClass";

export { FREIGHT_TEU_PER_UNIT_HOP } from "./freightClass";

const foreignBudgetKey = (exporter: CountryId, buyerStateId: string) =>
  `${exporter}\u0000${buyerStateId}`;

export type { SourcingOwnRoute };

// ── Pass ─────────────────────────────────────────────────────────────────────

const round2 = (n: number) => Math.round(n * 100) / 100;

function prepareRunSourcingPass(inputs: SourcingInputs) {
  const {
    states,
    byState,
    byCountry,
    demandUsesByState,
    statePricesFor,
    nationalPricesFor,
    basePriceFor,
    freightPrice,
    eraUnitScale = 1,
    hops,
    shippingCostMultiplier,
    tariffRatePct,
    isBlocked,
    shortageResponsiveSourcingEnabled = false,
    ownRoutes,
    ownFreightCapacityByState,
    ownFreightMarketSupply,
  } = inputs;

  // Deterministic iteration: states sorted by id, countries sorted by id.
  const sortedStates = [...states].sort((a, b) => a.stateId.localeCompare(b.stateId));
  const countryIds = [...byCountry.keys()].sort() as CountryId[];

  // Freight is one fungible fleet. Bulk and special record different TEU rates,
  // but they draw from the same state capacity instead of reserving idle slices
  // that make freight look oversupplied while one cargo class cannot move.
  const freightCapacityByState = new Map<string, number>();
  const freightUsedByState = new Map<string, Record<FreightClass, number>>();
  const freightDemandByState = new Map<string, Record<FreightClass, number>>();
  for (const { stateId } of sortedStates) {
    const freightSupply = byState.get(stateId)?.get("freight")?.supply ?? 0;
    freightCapacityByState.set(stateId, freightSupply);
    freightUsedByState.set(stateId, { bulk: 0, special: 0, grid: 0 });
    freightDemandByState.set(stateId, { bulk: 0, special: 0, grid: 0 });
  }

  const flows: SourcingFlow[] = [];
  const ownRouteDelivered: SourcingOwnRoute[] = [];
  const ownFreight = createOwnFreightLedger(ownFreightCapacityByState);
  const ownBudgets = ownRouteBudgets(ownRoutes ?? []);
  const stateById = new Map(sortedStates.map((state) => [state.stateId, state] as const));
  // Exporting states per country, so a foreign dispatch can be drawn from the
  // states whose spare backs the national pool (see drawExportFromStates).
  const statesByCountry = new Map<string, string[]>();
  for (const { stateId, countryId } of sortedStates) {
    const list = statesByCountry.get(countryId) ?? [];
    list.push(stateId);
    statesByCountry.set(countryId, list);
  }
  const summaries: SourcingCommoditySummary[] = [];
  const landedPremiumByDestState = new Map<string, Map<CommodityType, LandedPremiumAccumulator>>();
  const importAggregatesByCountry = new Map<string, ImportAggregate>();
  const purchaseExposureByDestState = new Map<
    string,
    Map<CommodityType, Record<PurchaseUse, PurchaseExposure>>
  >();
  const ensurePurchaseExposure = (stateId: string, commodity: CommodityType) => {
    let byCommodity = purchaseExposureByDestState.get(stateId);
    if (!byCommodity) purchaseExposureByDestState.set(stateId, (byCommodity = new Map()));
    let byUse = byCommodity.get(commodity);
    if (!byUse) byCommodity.set(commodity, (byUse = emptyPurchaseExposure()));
    return byUse;
  };
  const unplacedSupplyByState = new Map<CommodityType, Map<string, number>>();
  const deliveryLimitedSupplyByState = new Map<CommodityType, Map<string, number>>();
  const ownerDeliveryLimitedFractionByState = new Map<
    CommodityType,
    Map<string, Map<string, number>>
  >();
  const freightChargesByDestState = new Map<string, Map<CommodityType, number>>();
  const haulRevenueByOriginState = new Map<string, number>();
  const foreignQuotes = new Map<string, SourcingForeignQuote>();
  const pairAggregates: SourcingPairAggregate[] = [];
  const destinationAggregates: SourcingDestinationAggregate[] = [];

  const addFreightBilling = (
    destStateId: string,
    originStateId: string,
    commodity: CommodityType,
    amount: number
  ) => {
    if (!(amount > 0)) return;
    let byCommodity = freightChargesByDestState.get(destStateId);
    if (!byCommodity) {
      byCommodity = new Map();
      freightChargesByDestState.set(destStateId, byCommodity);
    }
    byCommodity.set(commodity, (byCommodity.get(commodity) ?? 0) + amount);
    haulRevenueByOriginState.set(
      originStateId,
      (haulRevenueByOriginState.get(originStateId) ?? 0) + amount
    );
  };

  const addLandedPremium = (
    destStateId: string,
    commodity: CommodityType,
    units: number,
    extraCost: number
  ) => {
    if (units <= 0) return;
    let byCommodity = landedPremiumByDestState.get(destStateId);
    if (!byCommodity) {
      byCommodity = new Map();
      landedPremiumByDestState.set(destStateId, byCommodity);
    }
    const acc = byCommodity.get(commodity) ?? { metUnits: 0, extraCost: 0 };
    acc.metUnits += units;
    acc.extraCost += extraCost;
    byCommodity.set(commodity, acc);
  };

  if (ownFreight.enabled) {
    // Each owner's planned hauls out of a state, so its capacity there is held
    // back from other companies until the commodity's own legs have been served.
    for (const route of ownRoutes ?? []) {
      const freightClass = FREIGHT_CLASS_BY_COMMODITY[route.commodity];
      const seller = stateById.get(route.originStateId);
      const buyer = stateById.get(route.destStateId);
      if (!freightClass || !isHauledClass(freightClass) || !seller || !buyer) continue;
      if (seller.countryId !== buyer.countryId || seller.stateId === buyer.stateId) continue;
      const hopCount = hops(buyer.countryId, seller.stateId, buyer.stateId);
      if (hopCount == null || hopCount <= 0) continue;
      const units = Math.min(
        route.units,
        route.originSupplyUnits ?? Infinity,
        route.destinationDemandUnits ?? Infinity
      );
      ownFreight.plan(
        route.originStateId,
        route.corporationId,
        route.commodity,
        units * freightTeuPerUnitHop(freightClass, eraUnitScale) * hopCount
      );
    }
  }

  // Units each route owner sends out of a state on its own routes, so market
  // shares are taken from what is left of its output.
  const ownRouteOutUnits = new Map<string, number>();
  const outKey = (commodity: CommodityType, stateId: string, routeId: string) =>
    `${commodity}\u0000${stateId}\u0000${routeId}`;
  const marketStage = ownFreight.enabled && ownFreightMarketSupply != null;
  const meanHopsCache = new Map<string, number>();
  const meanHopsFrom = (stateId: string) => {
    let mean = meanHopsCache.get(stateId);
    if (mean != null) return mean;
    const from = stateById.get(stateId);
    let sum = 0;
    let n = 0;
    for (const to of sortedStates) {
      if (!from || to.stateId === stateId || to.countryId !== from.countryId) continue;
      const h = hops(from.countryId, stateId, to.stateId);
      if (h != null && h > 0) {
        sum += h;
        n += 1;
      }
    }
    mean = n > 0 ? sum / n : 1;
    meanHopsCache.set(stateId, mean);
    return mean;
  };
  /** Owners' shares of the goods a state sends to market, given what own routes already took. */
  const marketOwnersFor = (commodity: CommodityType, stateId: string) => {
    const owners = marketStage ? ownFreightMarketSupply!.get(commodity)?.get(stateId) : undefined;
    if (!owners) return [];
    const supply = byState.get(stateId)?.get(commodity)?.supply ?? 0;
    let taken = 0;
    for (const [routeId] of owners)
      taken += ownRouteOutUnits.get(outKey(commodity, stateId, routeId)) ?? 0;
    const total = supply - taken;
    if (!(total > 0)) return [];
    const shares: Array<{ routeId: string; share: number; units: number }> = [];
    for (const [routeId, units] of owners) {
      const left = Math.max(
        0,
        units - (ownRouteOutUnits.get(outKey(commodity, stateId, routeId)) ?? 0)
      );
      if (left > 0) shares.push({ routeId, share: Math.min(1, left / total), units: left });
    }
    return shares;
  };
  if (marketStage) {
    // Hold each owner's capacity for the market sales it expects to ship, for
    // every commodity, before any commodity is served: an earlier commodity must
    // not use up the trucks a later one needs.
    for (const route of ownRoutes ?? []) {
      const units = Math.min(route.units, route.originSupplyUnits ?? Infinity);
      const k = outKey(route.commodity, route.originStateId, route.corporationId);
      ownRouteOutUnits.set(k, (ownRouteOutUnits.get(k) ?? 0) + units);
    }
    for (const commodity of SHIPPED_COMMODITIES) {
      const freightClass = FREIGHT_CLASS_BY_COMMODITY[commodity];
      if (!freightClass || !isHauledClass(freightClass)) continue;
      const teuPerUnitHop = freightTeuPerUnitHop(freightClass, eraUnitScale);
      for (const stateId of ownFreightMarketSupply!.get(commodity)?.keys() ?? []) {
        const bal = byState.get(stateId)?.get(commodity);
        const supply = bal?.supply ?? 0;
        if (!(supply > 0)) continue;
        const exportFraction = Math.max(0, supply - (bal?.demand ?? 0)) / supply;
        for (const { routeId, units } of marketOwnersFor(commodity, stateId)) {
          ownFreight.plan(
            stateId,
            routeId,
            commodity,
            units * exportFraction * teuPerUnitHop * meanHopsFrom(stateId),
            "market"
          );
        }
      }
    }
  }
  return {
    kind: "context" as const,
    context: {
      addFreightBilling,
      addLandedPremium,
      basePriceFor,
      byCountry,
      byState,
      countryIds,
      deliveryLimitedSupplyByState,
      demandUsesByState,
      destinationAggregates,
      ensurePurchaseExposure,
      eraUnitScale,
      flows,
      foreignBudgetKey,
      foreignQuotes,
      freightCapacityByState,
      freightChargesByDestState,
      freightDemandByState,
      freightPrice,
      freightUsedByState,
      haulRevenueByOriginState,
      hops,
      electricityNetwork: inputs.electricityNetwork,
      importAggregatesByCountry,
      isBlocked,
      landedPremiumByDestState,
      marketOwnersFor,
      marketStage,
      nationalPricesFor,
      ownBudgets,
      ownerDeliveryLimitedFractionByState,
      ownFreight,
      ownFreightMarketSupply,
      ownRouteDelivered,
      ownRoutes,
      pairAggregates,
      purchaseExposureByDestState,
      round2,
      shippingCostMultiplier,
      shortageResponsiveSourcingEnabled,
      sortedStates,
      stateById,
      statePricesFor,
      states,
      statesByCountry,
      summaries,
      tariffRatePct,
      unplacedSupplyByState,
    },
  };
}
export type RunSourcingPassStageContext = Extract<
  ReturnType<typeof prepareRunSourcingPass>,
  { kind: "context" }
>["context"];

export function runSourcingPass(
  ...args: Parameters<typeof prepareRunSourcingPass>
): SourcingResult {
  const prepared = prepareRunSourcingPass(...args);
  return settleSourcingPass(prepared.context);
}
