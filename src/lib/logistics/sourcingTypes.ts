import type { CommodityType } from "@/lib/constants/commodities";
import type { SourcingOwnRoute } from "@/lib/logistics/ownRoutes";

import type { CountryId } from "@/lib/constants/countries";
import {
  type DemandUsesByState,
  type PurchaseExposureByCountry,
} from "@/lib/logistics/rules/purchaseExposure";

import { type FreightClass } from "@/lib/logistics/freightClass";

// ── Types ────────────────────────────────────────────────────────────────────

export interface SourcingFlow {
  commodity: CommodityType;
  /** "state" = same-country interstate seller; "country" = foreign import. */
  originType: "state" | "country";
  originId: string;
  destStateId: string;
  units: number;
  /** 0 for intra-state; SEA_FREIGHT_HOP_EQUIV for overseas. */
  hops: number;
  freightClass: FreightClass;
  ask: number;
  shippingPerUnit: number;
  tariffRatePct: number;
  /** Duty settled at the border on dispatched units. */
  tariffPaid: number;
  /** Portion of settled duty attributable to delivered units after route loss. */
  deliveredTariffPaid: number;
  landedPrice: number;
  /** Domestic origin-state freight capacity consumed (TEU); 0 for imports. */
  freightTeuConsumed: number;
}

export interface SourcingCommoditySummary {
  commodity: CommodityType;
  intraStateUnits: number;
  interStateUnits: number;
  importUnits: number;
  tariffPaid: number;
  /** Demand still unmet after local fill + sourcing (tolerance/capacity/supply bound). */
  unmetUnits: number;
  /** Units that could not ship because a seller's landed price broke the ceiling. */
  toleranceBoundUnits: number;
  /** Units that could not ship because the origin state's shared freight capacity ran dry. */
  capacityBoundUnits: number;
  /** Units accepted only because severe local shortage raised willingness to pay. */
  shortageResponsiveUnits: number;
  /** Units that shipped only by pushing a state's network past nominal capacity. */
  congestionUnits: number;
  /** Extra shipping charge those overflow units paid. */
  congestionSurchargePaid: number;
  /** Units dispatched on the grid that never arrived (transmission loss). */
  gridLossUnits: number;
}

/**
 * Exact delivered trade between two countries for one commodity.
 * `exporter === importer` is same-country interstate haulage. Accumulated at
 * the accept site, so the itemization floor on `flows` cannot drop small legs.
 * Money fields are in the sourcing pass's price units (the stored commodity
 * asks); `askValue` is dispatched units at the seller ask, `landedValue` is
 * delivered units at the landed price.
 */
export interface SourcingPairAggregate {
  commodity: CommodityType;
  exporter: string;
  importer: string;
  deliveredUnits: number;
  dispatchedUnits: number;
  askValue: number;
  freightPaid: number;
  tariffPaid: number;
  landedValue: number;
  /** Sum of units x applied tariff rate; divide by deliveredUnits for the unit-weighted rate. */
  tariffRateUnits: number;
  legs: number;
}

/**
 * Buyer-intent outcome for one destination country and commodity.
 * Unmet-by-reason counters match the global {@link SourcingCommoditySummary}:
 * a request refused at one seller's gate counts there even if another seller
 * later serves it.
 */
export interface SourcingDestinationAggregate {
  commodity: CommodityType;
  country: string;
  /** Sum of the country's state-level demand for the commodity this turn. */
  demandUnits: number;
  /** Sum of the country's state-level supply for the commodity this turn. */
  supplyUnits: number;
  /**
   * Spare offered to foreign buyers: national supply minus demand (floored at
   * 0), plus state spare the country's own buyers passed over.
   */
  foreignOfferUnits: number;
  localUnits: number;
  interStateUnits: number;
  importUnits: number;
  unmetUnits: number;
  toleranceBoundUnits: number;
  capacityBoundUnits: number;
}

/** Delivered units and the extra-cost-over-local-price they carried, for a state/commodity. */
export interface LandedPremiumAccumulator {
  metUnits: number;
  extraCost: number;
}

/** Per-buyer-country import totals (for tariff-revenue and import-value reporting). */
export interface ImportAggregate {
  tariffPaid: number;
  importValue: number;
}

/** Ephemeral eligible overseas quote terms for next-turn price feedback. */
export interface SourcingForeignQuote {
  commodity: CommodityType;
  exporter: string;
  importer: string;
  tariffRatePct: number;
  rawShippingPerUnit: number;
  shippingAskShare: number;
  shippingMaxAskShare: number;
}

export interface SourcingResult {
  /** Full eligible quotes, independent of the diagnostic flow sample. Not persisted. */
  foreignQuotes?: SourcingForeignQuote[];
  flows: SourcingFlow[];
  ownRouteDelivered: SourcingOwnRoute[];
  /** Own-shipments-first: TEU each route owner hauled on its own capacity, per origin state. */
  ownFreightCoveredTeuByState?: Map<string, Map<string, number>>;
  /**
   * Own shipments first, stage 2: per commodity and origin state, the share of
   * each route owner's own output that was wanted and could not be delivered
   * (route identity -> fraction). `deliveryLimitedSupplyByState` is a state
   * figure covering every seller; this is the owner's own slice of it. Absent
   * for owners without freight capacity there, who keep the state figure.
   */
  ownerDeliveryLimitedFractionByState?: Map<CommodityType, Map<string, Map<string, number>>>;
  summaries: SourcingCommoditySummary[];
  /** TEU consumed per state per class, the load on each shipping network. */
  freightTeuByState: Map<string, Record<FreightClass, number>>;
  /**
   * Price-tolerant TEU demand per origin state and class. This includes the
   * load that moved plus the final unplaced cargo that the origin state's
   * capacity refused. It is the freight commodity demand book, while
   * {@link freightTeuByState} remains the observed network load.
   */
  freightDemandTeuByState: Map<string, Record<FreightClass, number>>;
  /**
   * Per destination state, per commodity: units actually delivered (local fill
   * plus interstate plus import) and the extra cost over local ask those units
   * carried (shipping plus tariff; zero for local fill). Money wiring (step 5)
   * divides extraCost by metUnits to get the per-unit landed premium a buyer in
   * that state pays for out-of-state sourcing.
   */
  landedPremiumByDestState: Map<string, Map<CommodityType, LandedPremiumAccumulator>>;
  /**
   * Per buyer country: total tariff paid and total import value (units × ask)
   * across all import flows into that country this turn.
   */
  importAggregatesByCountry: Map<string, ImportAggregate>;
  /** Proportionally attributed accepted purchases, in seller-ask value, by buyer use. */
  purchaseExposureByCountry?: PurchaseExposureByCountry;
  /**
   * Per commodity, per state: the state's OWN production that found no buyer
   * anywhere: what is left of its spare after local fill, every interstate
   * haul it could pay for, and the congestion overflow.
   *
   * This is the working spare the fill loop consumes, read at the end, so it
   * is exact. It CANNOT be reconstructed from `flows`: grid legs lose units in
   * transit, so delivered != dispatched and the arithmetic does not close.
   *
   * The sell side needs this number. Clearing is country-scoped while freight
   * settles state by state, so without it a seller is credited with output no
   * network could deliver.
   */
  unplacedSupplyByState: Map<CommodityType, Map<string, number>>;
  /**
   * Shipping money per DESTINATION state and commodity, from accepted domestic
   * hauled flows only. charge = units x shippingPerUnit plus the congestion
   * surcharge those units paid, accumulated at the accept site so itemization
   * floor on `flows` cannot drift the aggregate.
   *
   * Excluded so the transfer identity holds exactly: refused hauls (no units
   * moved), grid legs (wheeled off seller ask), imports (no origin network).
   *
   * Identity: sum over this map equals sum over
   * {@link haulRevenueByOriginState}. Transfer, never a sink.
   */
  freightChargesByDestState: Map<string, Map<CommodityType, number>>;
  /**
   * The other half of the transfer: shipping money earned per ORIGIN state,
   * i.e. what that state's freight network hauled for this turn. Same
   * accepted-domestic-hauled-flows-only scope as
   * {@link freightChargesByDestState}.
   */
  haulRevenueByOriginState: Map<string, number>;
  /**
   * The share of {@link unplacedSupplyByState} that failed for a DELIVERY
   * reason rather than because nobody wanted the goods.
   *
   * Spare left over when the pass ends means one of two very different things,
   * and a player needs them told apart: "the market is full" says cut output,
   * "it could not get there" says build freight.
   *
   * Only spare that the ORIGIN STATE'S OWN freight capacity refused to haul
   * counts here, accumulated at the capacity gate where the origin is known.
   * That is the only failure mode for which "build freight in this state" is
   * the right instruction, and the only one attributable to a specific seller.
   * A buyer who walked away over the landed price is a PRICE failure and is
   * deliberately excluded: it belongs to `toleranceBoundUnits`, and calling it
   * a delivery failure tells the seller to spend on trucks that would not have
   * sold the unit anyway.
   */
  deliveryLimitedSupplyByState: Map<CommodityType, Map<string, number>>;
  /** Exact country-pair delivered trade, for the research trade panel. */
  pairAggregates: SourcingPairAggregate[];
  /** Exact per-destination-country buyer-intent outcome. */
  destinationAggregates: SourcingDestinationAggregate[];
}

export type Balance = { supply: number; demand: number };

export type SourcingCandidate = {
  gridPath?: import("@/lib/electricityNetwork/rules/types").GridPath;
  originType: "state" | "country";
  originId: string;
  landed: number;
  ask: number;
  shippingPerUnit: number;
  tariffRatePct: number;
  hopCount: number;
  /** Same-country sellers win landed-price ties. */
  domestic: boolean;
  ownRoute?: SourcingOwnRoute;
};

export type FairForeignDemand = {
  buyerStateId: string;
  demandUnits: number;
};

export interface SourcingInputs {
  electricityNetwork?: import("@/lib/electricityNetwork/rules/types").ElectricityNetwork;
  /** Non-national-scope states with their country. */
  states: ReadonlyArray<{ stateId: string; countryId: CountryId }>;
  /** Per-state balances (read-only; the pass copies what it consumes). */
  byState: ReadonlyMap<string, ReadonlyMap<CommodityType, Balance>>;
  /** Per-country balances, for foreign national spare. */
  byCountry: ReadonlyMap<string, ReadonlyMap<CommodityType, Balance>>;
  /** Modeled household and production input intents; unclassified demand remains other. */
  demandUsesByState?: DemandUsesByState;
  /** LAST turn's stored prices — the fixed asks. */
  statePricesFor: (commodity: CommodityType) => Readonly<Record<string, number>> | undefined;
  nationalPricesFor: (commodity: CommodityType) => Readonly<Record<string, number>> | undefined;
  /** Fallback ask/tolerance anchor when no stored price exists (first turn). */
  basePriceFor: (commodity: CommodityType) => number;
  /** Last turn's global freight price — the shipping cost basis (era-scaled). */
  freightPrice: number;
  /**
   * World's era unit-basis scale (`getEraUnitScale(preset)`). Defaults to 1.
   * TEU-per-unit rates are scale-free (see {@link freightTeuPerUnitHop}); this
   * is threaded for plants call-site symmetry and future haulage $ rates.
   */
  eraUnitScale?: number;
  /** Same-country hop distance; null = no route. */
  hops: (country: CountryId, from: string, to: string) => number | null;
  /** Optional domestic route-cost modifier. Defaults to 1. */
  shippingCostMultiplier?: (country: CountryId, from: string, to: string) => number;
  /** Importer-side tariff rate in percent for a foreign flow. */
  tariffRatePct: (commodity: CommodityType, exporter: CountryId, importer: CountryId) => number;
  /** True when an embargo blocks the directed flow exporter→importer. */
  isBlocked: (commodity: CommodityType, exporter: CountryId, importer: CountryId) => boolean;
  /** Raise the landed-price ceiling only for states below 50 percent local fill. */
  shortageResponsiveSourcingEnabled?: boolean;
  ownRoutes?: ReadonlyArray<SourcingOwnRoute>;
  /**
   * Own shipments first: freight capacity each route owner holds per origin
   * state (state id -> route identity -> units, the same identity as
   * `SourcingOwnRoute.corporationId`). When present, an own route's haul draws
   * on its owner's capacity before the shared pool, and that capacity is held
   * back from everyone else's hauls while the owner still plans to use it. The
   * covered share of an own haul is internal supply: no freight charge and no
   * haul revenue. Absent = one shared first-come pool (the old behaviour).
   */
  ownFreightCapacityByState?: ReadonlyMap<string, ReadonlyMap<string, number>>;
  /**
   * Own shipments first, stage 2: what each route owner produces per commodity
   * and state (commodity -> state id -> route identity -> units). When present
   * with `ownFreightCapacityByState`, the state's market shipments are split by
   * these seller shares, and each owner's capacity first carries its share
   * (internal supply: no charge, no haul revenue) while the rest bills as
   * before. Absent = only own routes get priority (stage 1).
   */
  ownFreightMarketSupply?: ReadonlyMap<
    CommodityType,
    ReadonlyMap<string, ReadonlyMap<string, number>>
  >;
}
