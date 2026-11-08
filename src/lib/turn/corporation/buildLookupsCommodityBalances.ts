/** Commodity balance, price ratio and placement lookups for the corporation turn. */
import type { CommodityPrice } from "@/lib/db/types";
import type { CountryId } from "@/lib/constants/countries";
import type { TradeFlowSnapshot } from "@/lib/db/types/tradeFlowSnapshot";
import type { CommodityType } from "@/lib/constants/commodities";
import { latentDemandTopUp } from "@/lib/market/latentShortageSignal";
import { buildNationalCommodityBalances } from "@/lib/commodity-map";
import { capInputPriceRatioAtWorld } from "@/lib/corporations/physicalPnl";

/** Builds national and per-state commodity balances, price ratios and placement signals. */
export function buildCommodityBalanceLookups({
  commodityPrices,
  globalCommodityBalances,
  options,
  stateCountryMap,
  latestTradeSnapshot,
}: {
  commodityPrices: CommodityPrice[];
  globalCommodityBalances: Map<
    | "steel"
    | "electronics"
    | "energy"
    | "chemicals"
    | "pharmaceuticals"
    | "fertilizers"
    | "food"
    | "building_materials"
    | "construction_services"
    | "healthcare_services"
    | "real_estate_services"
    | "software"
    | "financial_services"
    | "advertising"
    | "vehicles"
    | "retail"
    | "freight"
    | "consulting_services"
    | "iron"
    | "coal"
    | "oil"
    | "rare_earth"
    | "timber"
    | "natural_gas"
    | "ordnance"
    | "plastics"
    | "network_services",
    { supply: number; demand: number }
  >;
  options:
    | {
        omitBuildQueue?: boolean;
        plantsEnabled?: boolean;
        explicitPlantCostsEnabled?: boolean;
        productionTurn?: number;
        moneyWiringEnabled?: boolean;
        productLinesV2Enabled?: boolean;
        mediaProductSlatesEnabled?: boolean;
        freightSettlementActive?: boolean;
        canonicalFreightBillingEnabled?: boolean;
        mediaEditorialEnabled?: boolean;
        politicalMediaMarketEnabled?: boolean;
      }
    | undefined;
  stateCountryMap: Map<string, CountryId>;
  latestTradeSnapshot: WithId<TradeFlowSnapshot>[];
}) {
  const nationalCommodityBalancesByCountry = new Map<
    CountryId,
    Map<CommodityType, { supply: number; demand: number }>
  >();
  const rawStateBalances = new Map<
    string,
    Map<CommodityType, { supply: number; demand: number }>
  >();
  // Lagged price-over-base per STATE, the state twin of
  // `reachablePriceRatioByCountry`. Feeds the price-realization leg for
  // state-scoped commodities, so a seller in a locally short
  // state is paid that state's scarcity price rather than the national one.
  const statePriceRatioByState = new Map<string, Map<CommodityType, number>>();
  const stateInputAvailabilityByState = new Map<string, Map<CommodityType, number>>();
  const statePlacementRatioByState = new Map<string, Map<CommodityType, number>>();
  const stateDeliveryLimitedRatioByState = new Map<string, Map<CommodityType, number>>();
  const ownerDeliveryLimitedRatioByCorp = new Map<
    string,
    Map<string, Map<CommodityType, number>>
  >();
  // Market rework (marketSystemMode >= "realization"): lagged price-over-base
  // ratio per commodity. commodityPrices docs hold the price computed by the
  // PRIOR commodity-price pass, so reading them here is the one-turn lag that
  // breaks the price->revenue->supply->price circularity.
  const priceRatioByCommodity = new Map<CommodityType, number>();
  const initializedLaggedBooks = new Set<CommodityType>();
  const reachablePriceRatioByCountry = new Map<string, Map<CommodityType, number>>();
  // Demand the ledger cut off at its 1.5x-supply cap, as a multiple of the
  // capped demand it kept. The price signal already adds this back
  // (latentShortageSignal); the production throttle's headroom needs it too, or
  // a sold-out plant ramps only toward the truncated book and supply never
  // catches a deep shortage.
  const latentDemandFactorByCommodity = new Map<CommodityType, number>();
  for (const cp of commodityPrices) {
    if (cp.turn > 0) initializedLaggedBooks.add(cp.commodity);
    const topUp = latentDemandTopUp(cp.globalDemand, cp.globalDemand, cp.demandTruncatedUnits);
    if (topUp > 0) latentDemandFactorByCommodity.set(cp.commodity, 1 + topUp / cp.globalDemand);
    globalCommodityBalances.set(cp.commodity, {
      supply: cp.globalSupply,
      demand: cp.globalDemand,
    });
    if (
      typeof cp.globalPrice === "number" &&
      typeof cp.basePrice === "number" &&
      Number.isFinite(cp.globalPrice / cp.basePrice) &&
      cp.globalPrice > 0 &&
      cp.basePrice > 0
    ) {
      priceRatioByCommodity.set(cp.commodity, cp.globalPrice / cp.basePrice);
    }

    // Lagged per-country reachable price ratios (partition worlds). Feeds
    // clearing's price-realization leg AND the physical input bill so a
    // partitioned buyer pays ITS market's price level, not the worldwide one
    // — observed live (t174): US farms billed fertilizer at the world 2.38x
    // while their own reachable market sold it at 1.08x, so margins FELL as
    // the domestic shortage cleared. Sparse: absent countries fall back to
    // `priceRatioByCommodity` at each consumer.
    if (typeof cp.basePrice === "number" && cp.basePrice > 0 && cp.reachablePrices) {
      for (const [countryId, price] of Object.entries(cp.reachablePrices)) {
        if (!(typeof price === "number" && price > 0)) continue;
        let byCommodity = reachablePriceRatioByCountry.get(countryId);
        if (!byCommodity) {
          byCommodity = new Map<CommodityType, number>();
          reachablePriceRatioByCountry.set(countryId, byCommodity);
        }
        byCommodity.set(cp.commodity, price / cp.basePrice);
      }
    }

    for (const stateId of Object.keys(cp.stateSupply)) {
      if (!rawStateBalances.has(stateId)) {
        rawStateBalances.set(stateId, new Map());
      }
      rawStateBalances.get(stateId)!.set(cp.commodity, {
        supply: cp.stateSupply[stateId] ?? 0,
        demand: cp.stateDemand[stateId] ?? 0,
      });
    }

    if (typeof cp.basePrice === "number" && cp.basePrice > 0 && cp.statePrices) {
      for (const [stateId, price] of Object.entries(cp.statePrices)) {
        if (!(typeof price === "number" && price > 0)) continue;
        let byCommodity = statePriceRatioByState.get(stateId);
        if (!byCommodity) {
          byCommodity = new Map<CommodityType, number>();
          statePriceRatioByState.set(stateId, byCommodity);
        }
        byCommodity.set(cp.commodity, price / cp.basePrice);
      }
    }

    if (options?.freightSettlementActive) {
      for (const [stateId, availability] of Object.entries(cp.stateInputAvailability ?? {})) {
        if (!Number.isFinite(availability)) continue;
        if (!stateInputAvailabilityByState.has(stateId)) {
          stateInputAvailabilityByState.set(stateId, new Map());
        }
        stateInputAvailabilityByState
          .get(stateId)!
          .set(cp.commodity, Math.max(0, Math.min(1, availability)));
      }
      // Sell-side twin of the availability read above: the share of a state's
      // own output that last turn's network could place. Sectors offer into a
      // COUNTRY-scoped clearing book while their goods move on a STATE-scoped
      // network, so without this the offer claims deliveries the network never
      // made (t225: 60.4% of world production stranded in a state that did not
      // need it, against 28.7% of world demand unmet). Missing state, missing
      // doc field, or zero supply all mean "no evidence of a limit" and are
      // read as a ratio of 1 by the consumer.
      for (const [stateId, placed] of Object.entries(cp.statePlacedSupply ?? {})) {
        if (!Number.isFinite(placed)) continue;
        const supply = cp.stateSupply?.[stateId] ?? 0;
        if (!(supply > 0)) continue;
        if (!statePlacementRatioByState.has(stateId)) {
          statePlacementRatioByState.set(stateId, new Map());
        }
        statePlacementRatioByState
          .get(stateId)!
          .set(cp.commodity, Math.max(0, Math.min(1, placed / supply)));
      }
      // Second ratio, same denominator, different question. The placement ratio
      // caps the OFFER (the book should shrink whatever the reason, glut
      // included); this one is the only figure allowed to tell a player their
      // goods could not get there. Keeping them apart is the whole point: the
      // two states of the world call for opposite decisions.
      for (const [stateId, byCorp] of Object.entries(cp.stateOwnerDeliveryLimited ?? {})) {
        for (const [corpId, fraction] of Object.entries(byCorp)) {
          if (!Number.isFinite(fraction)) continue;
          let byState = ownerDeliveryLimitedRatioByCorp.get(corpId);
          if (!byState) ownerDeliveryLimitedRatioByCorp.set(corpId, (byState = new Map()));
          let byCommodity = byState.get(stateId);
          if (!byCommodity) byState.set(stateId, (byCommodity = new Map()));
          byCommodity.set(cp.commodity, Math.max(0, Math.min(1, fraction)));
        }
      }
      for (const [stateId, deliveryLimited] of Object.entries(
        cp.stateDeliveryLimitedSupply ?? {}
      )) {
        if (!Number.isFinite(deliveryLimited)) continue;
        const supply = cp.stateSupply?.[stateId] ?? 0;
        if (!(supply > 0)) continue;
        if (!stateDeliveryLimitedRatioByState.has(stateId)) {
          stateDeliveryLimitedRatioByState.set(stateId, new Map());
        }
        stateDeliveryLimitedRatioByState
          .get(stateId)!
          .set(cp.commodity, Math.max(0, Math.min(1, deliveryLimited / supply)));
      }
    }

    const perCountry = buildNationalCommodityBalances(cp, stateCountryMap);
    for (const [countryId, balance] of perCountry) {
      if (!nationalCommodityBalancesByCountry.has(countryId as CountryId)) {
        nationalCommodityBalancesByCountry.set(countryId as CountryId, new Map());
      }
      nationalCommodityBalancesByCountry.get(countryId as CountryId)!.set(cp.commodity, balance);
    }
  }

  // Per-country INPUT price ratios: the world map overlaid with each
  // country's reachable ratios, CAPPED AT THE WORLD RATIO per commodity.
  // The input bill is linear and unclamped while revenue realization is
  // damped (ratio^0.5, max 1.5x), so billing inputs above the world level
  // hands every buyer a cost no seller-side leg can capture back. Observed
  // live (t175): pinned bloc reachable ratios (steel FR 4.1x vs world 2.0x)
  // fed straight into the bill and put ~70% of all corps at negative income
  // in one turn. min(world, reachable) keeps the t174 fix (buyers in cheap
  // reachable markets stop paying world) without the blowup. World-map
  // fallback per commodity; base-price fallback only where the world has no
  // ratio either.
  const reachableInputPriceRatiosByCountry = new Map<string, Map<CommodityType, number>>();
  for (const [countryId, byCommodity] of reachablePriceRatioByCountry) {
    const merged = new Map(priceRatioByCommodity);
    for (const [commodity, ratio] of byCommodity) {
      const world = priceRatioByCommodity.get(commodity);
      merged.set(commodity, capInputPriceRatioAtWorld(world, ratio));
    }
    reachableInputPriceRatiosByCountry.set(countryId, merged);
  }

  // Per-country export intensity from the latest trade snapshot: for each
  // commodity a country net-exports, the fraction of its surplus that cleared
  // abroad ∈ [0,1]. Feeds the export-reward margin premium. Empty when no
  // snapshot exists yet (pre-first-trade-turn).
  const exportIntensityByCountry = new Map<CountryId, Map<CommodityType, number>>();
  const tradeSnapshotDoc = latestTradeSnapshot[0];
  if (tradeSnapshotDoc) {
    for (const [commodity, cf] of Object.entries(tradeSnapshotDoc.commodities) as Array<
      [CommodityType, NonNullable<TradeFlowSnapshot["commodities"][CommodityType]>]
    >) {
      for (const [countryId, pc] of Object.entries(cf.perCountry)) {
        if (pc.net <= 0 || pc.exports <= 0) continue;
        const surplusValue = pc.exports + Math.max(0, pc.uncleared);
        const intensity = surplusValue > 0 ? pc.exports / surplusValue : 0;
        if (intensity <= 0) continue;
        if (!exportIntensityByCountry.has(countryId as CountryId)) {
          exportIntensityByCountry.set(countryId as CountryId, new Map());
        }
        exportIntensityByCountry.get(countryId as CountryId)!.set(commodity, intensity);
      }
    }
  }
  return {
    nationalCommodityBalancesByCountry,
    tradeSnapshotDoc,
    initializedLaggedBooks,
    stateInputAvailabilityByState,
    statePlacementRatioByState,
    stateDeliveryLimitedRatioByState,
    ownerDeliveryLimitedRatioByCorp,
    priceRatioByCommodity,
    latentDemandFactorByCommodity,
    reachablePriceRatioByCountry,
    reachableInputPriceRatiosByCountry,
    exportIntensityByCountry,
    rawStateBalances,
    statePriceRatioByState,
  };
}
